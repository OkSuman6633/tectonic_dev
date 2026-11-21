"""Google Analytics 4 (Data API v1beta) connector — read-only.

Auth, two schemes (both need the GA4 property id):

* ``oauth``            a user-delegated OAuth access token (``analytics.readonly`` scope). Optionally a
                       refresh token + OAuth client id/secret, so the connector renews the 1-hour token itself.
* ``service_account``  a service-account JSON key. The connector signs a JWT with the key and exchanges it
                       for short-lived access tokens; the service-account e-mail must be added as a Viewer
                       on the property (GA4 Admin → Property access management).

Reads: ``report`` (any dimensions/metrics), ``traffic_overview``, ``source_medium``, ``conversions``
(key events and session conversion rate) and ``metadata`` (valid dimension/metric names).
"""

from __future__ import annotations

import json
import os
import re
import time
from typing import Any
from urllib.parse import urlparse

import httpx

from .base import (AuthScheme, BaseConnector, Capability, ConnectorError, CredentialField, CredentialsInvalid,
                   as_int, as_list, to_number)

DATA_API = os.getenv("GA4_DATA_API_URL", "https://analyticsdata.googleapis.com/v1beta").rstrip("/")
TOKEN_URL = "https://oauth2.googleapis.com/token"
SCOPE = "https://www.googleapis.com/auth/analytics.readonly"
# A signed assertion is only ever sent to Google's token endpoints, whatever an uploaded key file says.
_TOKEN_HOSTS = {"oauth2.googleapis.com", "accounts.google.com", "www.googleapis.com"}
_DATE = r"^(\d{4}-\d{2}-\d{2}|today|yesterday|\d{1,4}daysAgo)$"
_PROPERTY = re.compile(r"^(?:properties/)?(\d{4,20})$")
_MATCH_TYPES = ["EXACT", "BEGINS_WITH", "ENDS_WITH", "CONTAINS", "FULL_REGEXP", "PARTIAL_REGEXP"]

_DATES = {
    "start_date": {"type": "string", "pattern": _DATE, "description": "YYYY-MM-DD, 'today', 'yesterday' or 'NdaysAgo'. Default 28daysAgo."},
    "end_date": {"type": "string", "pattern": _DATE, "description": "Same formats. Default today."},
}
_FILTERS = {
    "type": "array",
    "description": "Dimension filters, all of which must match.",
    "items": {
        "type": "object",
        "properties": {
            "field": {"type": "string", "description": "Dimension apiName, e.g. sessionSourceMedium, country, eventName."},
            "value": {"type": "string", "description": "Value to match (comma-separate several with match IN_LIST)."},
            "match": {"type": "string", "enum": [*_MATCH_TYPES, "IN_LIST"], "description": "Default EXACT."},
            "exclude": {"type": "boolean", "description": "Exclude matching rows instead."},
        },
        "required": ["field", "value"],
    },
}
_REPORT_SCHEMA = {
    "type": "object",
    "properties": {
        "metrics": {"type": "array", "items": {"type": "string"}, "minItems": 1,
                    "description": "Metric apiNames, e.g. sessions, totalUsers, engagementRate, keyEvents, sessionKeyEventRate, totalRevenue."},
        "dimensions": {"type": "array", "items": {"type": "string"},
                       "description": "Dimension apiNames, e.g. date, sessionSourceMedium, sessionDefaultChannelGroup, country, deviceCategory, landingPage."},
        **_DATES,
        "filters": _FILTERS,
        "order_by": {"type": "string", "description": "Metric or dimension apiName to sort by (default: first metric)."},
        "ascending": {"type": "boolean", "description": "Sort ascending (default descending)."},
        "limit": {"type": "integer", "minimum": 1, "maximum": 10000, "description": "Maximum rows (default 100)."},
    },
    "required": ["metrics"],
}
_TRAFFIC_SCHEMA = {
    "type": "object",
    "properties": {
        **_DATES,
        "by": {"type": "string", "enum": ["none", "date", "week", "deviceCategory", "country", "landingPage", "sessionDefaultChannelGroup"],
               "description": "Optional breakdown dimension (default none: one total row)."},
        "filters": _FILTERS,
        "limit": {"type": "integer", "minimum": 1, "maximum": 10000},
    },
}
_SOURCE_SCHEMA = {
    "type": "object",
    "properties": {
        **_DATES,
        "group_by": {"type": "string", "enum": ["source_medium", "source", "medium", "channel", "campaign"],
                     "description": "Attribution grouping (default source_medium)."},
        "filters": _FILTERS,
        "limit": {"type": "integer", "minimum": 1, "maximum": 10000, "description": "Default 25."},
    },
}
_CONVERSIONS_SCHEMA = {
    "type": "object",
    "properties": {
        **_DATES,
        "by": {"type": "string", "description": "Optional dimension to compute conversion rate per value, e.g. sessionSourceMedium, deviceCategory, landingPage."},
        "limit": {"type": "integer", "minimum": 1, "maximum": 1000, "description": "Default 25."},
    },
}
_METADATA_SCHEMA = {
    "type": "object",
    "properties": {"search": {"type": "string", "description": "Only names containing this text (case-insensitive)."}},
}

_GROUPS = {"source_medium": "sessionSourceMedium", "source": "sessionSource", "medium": "sessionMedium",
           "channel": "sessionDefaultChannelGroup", "campaign": "sessionCampaignName"}
_TRAFFIC_METRICS = ["sessions", "totalUsers", "newUsers", "engagedSessions", "engagementRate", "averageSessionDuration",
                    "screenPageViews", "keyEvents", "sessionKeyEventRate"]
_INT_TYPES = {"TYPE_INTEGER"}


class GoogleAnalyticsConnector(BaseConnector):
    name = "google_analytics"
    label = "Google Analytics 4"
    tool_prefix = "ga4"
    description = "GA4 website/app traffic, acquisition (source/medium, channels) and key-event conversion reports."
    docs_url = "https://developers.google.com/analytics/devguides/reporting/data/v1/quickstart-client-libraries"
    _property_field = CredentialField("property_id", "GA4 property ID", secret=False, kind="text", placeholder="123456789",
                                      pattern=r"(?:properties/)?\d{4,20}",
                                      help="GA4 Admin → Property settings → Property ID (digits only, not the G- measurement id).")
    auth_schemes = (
        AuthScheme(
            id="service_account",
            label="Service account key (recommended)",
            instructions=("In Google Cloud: enable the 'Google Analytics Data API', create a service account and "
                          "download a JSON key. Then in GA4 Admin → Property access management, add the service "
                          "account's e-mail (client_email in the JSON) as a Viewer."),
            fields=(
                _property_field,
                CredentialField("service_account_json", "Service account JSON key", secret=True, kind="file",
                                accept=".json,application/json",
                                help="Upload the key file. It is encrypted for this session and never sent to the AI model."),
            ),
        ),
        AuthScheme(
            id="oauth",
            label="OAuth access token",
            instructions=("An OAuth 2.0 access token for a Google user with access to the property, scope "
                          "analytics.readonly (e.g. from the OAuth 2.0 Playground). Access tokens expire after "
                          "an hour — add a refresh token with its OAuth client id and secret to renew automatically."),
            fields=(
                _property_field,
                CredentialField("access_token", "OAuth access token", secret=True, required=False, kind="password",
                                placeholder="ya29.…"),
                CredentialField("refresh_token", "Refresh token (optional)", secret=True, required=False, kind="password",
                                placeholder="1//…"),
                CredentialField("client_id", "OAuth client ID (with refresh token)", secret=False, required=False,
                                kind="text", placeholder="….apps.googleusercontent.com"),
                CredentialField("client_secret", "OAuth client secret (with refresh token)", secret=True,
                                required=False, kind="password"),
            ),
        ),
    )
    capabilities = (
        Capability("report", "read",
                   "Run a custom GA4 report: any metrics by any dimensions over a date range, with filters and "
                   "sorting. Returns typed rows plus totals. Use ga4_metadata to look up valid names.", _REPORT_SCHEMA),
        Capability("traffic_overview", "read",
                   "Traffic summary: sessions, users, new users, engaged sessions, engagement rate, average session "
                   "duration, page views, key events and session conversion rate; optionally by date/device/country.",
                   _TRAFFIC_SCHEMA),
        Capability("source_medium", "read",
                   "Acquisition breakdown by source/medium (or source, medium, default channel group, campaign): "
                   "sessions, users, engagement rate, key events, conversion rate and revenue.", _SOURCE_SCHEMA),
        Capability("conversions", "read",
                   "Conversion performance: overall session conversion (key event) rate, key events by event name, "
                   "and optionally conversion rate per dimension value.", _CONVERSIONS_SCHEMA),
        Capability("metadata", "read", "List the property's valid dimension and metric apiNames (including custom ones).",
                   _METADATA_SCHEMA),
    )

    # --- credentials ----------------------------------------------------------------------------
    @classmethod
    def normalize_credentials(cls, scheme_id: str, values: dict[str, Any]) -> dict[str, str]:
        clean = super().normalize_credentials(scheme_id, values)
        clean["property_id"] = _PROPERTY.match(clean["property_id"]).group(1)  # type: ignore[union-attr]
        if scheme_id == "service_account":
            info = cls._service_account_info(clean["service_account_json"])
            clean["service_account_json"] = json.dumps(info)
        else:
            refresh = clean.get("refresh_token")
            if not clean.get("access_token") and not refresh:
                raise ConnectorError("provide an OAuth access token, or a refresh token with client id and secret",
                                     code="invalid_credentials_input")
            if refresh and not (clean.get("client_id") and clean.get("client_secret")):
                raise ConnectorError("a refresh token needs the OAuth client id and client secret it was issued to",
                                     code="invalid_credentials_input")
        return clean

    @staticmethod
    def _service_account_info(raw: str) -> dict[str, Any]:
        try:
            info = json.loads(raw)
        except ValueError:
            raise ConnectorError("the service account key is not valid JSON", code="invalid_credentials_input") from None
        if not isinstance(info, dict) or info.get("type") != "service_account":
            raise ConnectorError("this JSON is not a service account key (type must be 'service_account')",
                                 code="invalid_credentials_input")
        missing = [k for k in ("client_email", "private_key", "private_key_id") if not info.get(k)]
        if missing:
            raise ConnectorError(f"the service account key is missing {missing}", code="invalid_credentials_input")
        return info

    @property
    def property_id(self) -> str:
        return self.credentials.require("property_id")

    @property
    def client_email(self) -> str | None:
        raw = self.credentials.get("service_account_json")
        return json.loads(raw).get("client_email") if raw else None

    # --- tokens ---------------------------------------------------------------------------------
    def _cached_token(self) -> str | None:
        token = self.credentials.cache.get("access_token")
        expires = float(self.credentials.cache.get("access_token_expires_at") or 0)
        return token if token and expires - 60 > time.time() else None

    def _remember(self, body: dict[str, Any]) -> str:
        token = body.get("access_token")
        if not token:
            raise CredentialsInvalid("Google's token endpoint returned no access token")
        self.credentials.cache.update(access_token=token,
                                      access_token_expires_at=time.time() + float(body.get("expires_in") or 3600))
        from .redaction import register_secret

        register_secret(token)
        return token

    async def _token_request(self, url: str, data: dict[str, str]) -> str:
        response = await self.http.request("POST", url, data=data)
        try:
            body = response.json()
        except ValueError:
            body = {}
        if response.status_code >= 400:
            error = body.get("error_description") or body.get("error") or f"HTTP {response.status_code}"
            raise CredentialsInvalid(f"Google rejected the credentials: {error}", status=response.status_code)
        return self._remember(body)

    async def _service_account_token(self) -> str:
        from google.auth import crypt, jwt

        info = json.loads(self.credentials.require("service_account_json"))
        token_uri = info.get("token_uri") or TOKEN_URL
        if urlparse(token_uri).scheme != "https" or urlparse(token_uri).hostname not in _TOKEN_HOSTS:
            token_uri = TOKEN_URL
        try:
            signer = crypt.RSASigner.from_service_account_info(info)
        except Exception:
            raise CredentialsInvalid("the service account private key could not be read") from None
        now = int(time.time())
        assertion = jwt.encode(signer, {"iss": info["client_email"], "scope": SCOPE, "aud": token_uri,
                                        "iat": now, "exp": now + 3600})
        assertion = assertion.decode() if isinstance(assertion, bytes) else assertion
        return await self._token_request(token_uri, {
            "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer", "assertion": assertion})

    def _can_refresh(self) -> bool:
        return self.credentials.scheme == "service_account" or bool(self.credentials.get("refresh_token"))

    async def _refresh(self) -> str:
        if self.credentials.scheme == "service_account":
            return await self._service_account_token()
        if not self.credentials.get("refresh_token"):
            raise CredentialsInvalid("the OAuth access token expired and no refresh token was provided")
        return await self._token_request(TOKEN_URL, {
            "grant_type": "refresh_token", "refresh_token": self.credentials.require("refresh_token"),
            "client_id": self.credentials.require("client_id"), "client_secret": self.credentials.require("client_secret")})

    async def _token(self) -> str:
        cached = self._cached_token()
        if cached:
            return cached
        if self.credentials.scheme == "oauth" and self.credentials.get("access_token") and \
                not self.credentials.cache.get("access_token_expires_at"):
            return self.credentials.require("access_token")  # as given; refreshed on the first 401
        return await self._refresh()

    # --- HTTP -------------------------------------------------------------------------------------
    async def _call(self, method: str, path: str, *, body: Any = None, auth_check: bool = False) -> dict[str, Any]:
        url = f"{DATA_API}/properties/{self.property_id}{path}"
        token = await self._token()
        for attempt in (1, 2):
            response = await self.http.request(method, url, json=body, headers={
                "Authorization": f"Bearer {token}", "Accept": "application/json"})
            if response.status_code == 401 and attempt == 1 and self._can_refresh():
                self.credentials.cache.pop("access_token_expires_at", None)
                token = await self._refresh()
                continue
            break
        try:
            data = response.json()
        except ValueError:
            data = {}
        if response.status_code < 400:
            return data
        err = data.get("error") or {} if isinstance(data, dict) else {}
        status = err.get("status") or f"HTTP {response.status_code}"
        message = f"GA4 Data API {status}: {err.get('message') or response.reason_phrase}"
        if response.status_code == 401:
            raise CredentialsInvalid(message + " — the access token is expired or revoked.", status=401)
        if response.status_code == 403:
            hint = (f" Add {self.client_email} as a Viewer in GA4 Admin → Property access management, and make "
                    "sure the Google Analytics Data API is enabled in its Cloud project.") if self.client_email else \
                " The Google account behind the token needs at least Viewer access to this property."
            raise CredentialsInvalid(message + hint, status=403)
        if response.status_code == 404 and auth_check:
            raise CredentialsInvalid(message + " — check the property id.", status=404)
        if response.status_code == 429:
            raise ConnectorError(message + " — GA4 quota exhausted; wait before retrying.", code="rate_limited",
                                 status=429, retryable=True)
        if response.status_code == 400:
            raise ConnectorError(message + " (use ga4_metadata to list valid dimension and metric names)",
                                 code="invalid_parameters", status=400)
        raise ConnectorError(message, code="upstream_error", status=response.status_code)

    # --- operations -----------------------------------------------------------------------------
    async def authenticate(self) -> dict[str, Any]:
        data = await self._call("POST", ":runReport", auth_check=True, body={
            "dateRanges": [{"startDate": "7daysAgo", "endDate": "today"}], "metrics": [{"name": "sessions"}], "limit": 1})
        meta = data.get("metadata") or {}
        profile = {"property_id": self.property_id, "currency": meta.get("currencyCode"), "timezone": meta.get("timeZone")}
        if self.client_email:
            profile["service_account"] = self.client_email
        return profile

    async def fetch_data(self, resource: str, params: dict[str, Any]) -> dict[str, Any]:
        self.capability(resource, "read")
        handler = {"report": self._report, "traffic_overview": self._traffic, "source_medium": self._source_medium,
                   "conversions": self._conversions, "metadata": self._metadata}[resource]
        return await handler(params)

    @staticmethod
    def _dates(p: dict[str, Any]) -> dict[str, str]:
        start, end = str(p.get("start_date") or "28daysAgo"), str(p.get("end_date") or "today")
        for value in (start, end):
            if not re.match(_DATE, value):
                raise ConnectorError(f"invalid date {value!r}: use YYYY-MM-DD, today, yesterday or NdaysAgo",
                                     code="invalid_parameters")
        return {"startDate": start, "endDate": end}

    @staticmethod
    def _filter(filters: Any) -> dict[str, Any] | None:
        if not filters:
            return None
        if isinstance(filters, str):
            try:
                filters = json.loads(filters)
            except ValueError:
                raise ConnectorError("filters must be a list of {field, value, match}", code="invalid_parameters") from None
        expressions = []
        for f in filters if isinstance(filters, list) else [filters]:
            if not isinstance(f, dict) or not f.get("field") or f.get("value") in (None, ""):
                raise ConnectorError("each filter needs a field and a value", code="invalid_parameters")
            match = str(f.get("match") or "EXACT").upper()
            if match == "IN_LIST":
                inner = {"inListFilter": {"values": as_list(f["value"]), "caseSensitive": False}}
            elif match in _MATCH_TYPES:
                inner = {"stringFilter": {"matchType": match, "value": str(f["value"]), "caseSensitive": False}}
            else:
                raise ConnectorError(f"filter match must be one of {_MATCH_TYPES + ['IN_LIST']}", code="invalid_parameters")
            expr = {"filter": {"fieldName": str(f["field"]), **inner}}
            expressions.append({"notExpression": expr} if f.get("exclude") else expr)
        return expressions[0] if len(expressions) == 1 else {"andGroup": {"expressions": expressions}}

    async def _run(self, *, metrics: list[str], dimensions: list[str], dates: dict[str, str], limit: int,
                   filters: Any = None, order_by: str | None = None, ascending: bool = False) -> dict[str, Any]:
        if not metrics:
            raise ConnectorError("at least one metric is required", code="invalid_parameters")
        body: dict[str, Any] = {"dateRanges": [dates], "metrics": [{"name": m} for m in metrics],
                                "dimensions": [{"name": d} for d in dimensions], "limit": limit,
                                "metricAggregations": ["TOTAL"]}
        dim_filter = self._filter(filters)
        if dim_filter:
            body["dimensionFilter"] = dim_filter
        order = order_by or metrics[0]
        if order in dimensions:
            body["orderBys"] = [{"dimension": {"dimensionName": order}, "desc": not ascending}]
        elif order in metrics:
            body["orderBys"] = [{"metric": {"metricName": order}, "desc": not ascending}]
        data = await self._call("POST", ":runReport", body=body)
        return self._shape(data, dates)

    @staticmethod
    def _value(raw: Any, metric_type: str) -> Any:
        number = to_number(raw)
        if isinstance(number, float) and metric_type in _INT_TYPES:
            return int(number)
        return round(number, 6) if isinstance(number, float) else number

    def _shape(self, data: dict[str, Any], dates: dict[str, str]) -> dict[str, Any]:
        dims = [h["name"] for h in data.get("dimensionHeaders") or []]
        mets = [(h["name"], h.get("type", "")) for h in data.get("metricHeaders") or []]
        rows = []
        for r in data.get("rows") or []:
            row = {d: v.get("value") for d, v in zip(dims, r.get("dimensionValues") or [])}
            row.update({m: self._value(v.get("value"), t) for (m, t), v in zip(mets, r.get("metricValues") or [])})
            rows.append(row)
        totals = {}
        if data.get("totals"):
            totals = {m: self._value(v.get("value"), t)
                      for (m, t), v in zip(mets, data["totals"][0].get("metricValues") or [])}
        meta = data.get("metadata") or {}
        row_count = int(data.get("rowCount") or len(rows))
        return {"property_id": self.property_id, "date_range": {"start_date": dates["startDate"], "end_date": dates["endDate"]},
                "dimensions": dims, "metrics": [m for m, _ in mets], "row_count": row_count,
                "truncated": row_count > len(rows), "totals": totals, "rows": rows,
                "currency": meta.get("currencyCode"), "timezone": meta.get("timeZone")}

    async def _report(self, p: dict[str, Any]) -> dict[str, Any]:
        return await self._run(metrics=as_list(p.get("metrics")), dimensions=as_list(p.get("dimensions")),
                               dates=self._dates(p), limit=as_int(p.get("limit"), 100, lo=1, hi=10000),
                               filters=p.get("filters"), order_by=p.get("order_by"), ascending=bool(p.get("ascending")))

    async def _traffic(self, p: dict[str, Any]) -> dict[str, Any]:
        by = p.get("by") or "none"
        dims = [] if by == "none" else ["yearWeek" if by == "week" else by]
        return await self._run(metrics=_TRAFFIC_METRICS, dimensions=dims, dates=self._dates(p),
                               limit=as_int(p.get("limit"), 400 if dims else 1, lo=1, hi=10000), filters=p.get("filters"),
                               order_by=dims[0] if dims and by in ("date", "week") else None,
                               ascending=by in ("date", "week"))

    async def _source_medium(self, p: dict[str, Any]) -> dict[str, Any]:
        group = p.get("group_by") or "source_medium"
        if group not in _GROUPS:
            raise ConnectorError(f"group_by must be one of {list(_GROUPS)}", code="invalid_parameters")
        return await self._run(metrics=["sessions", "totalUsers", "engagementRate", "keyEvents", "sessionKeyEventRate",
                                        "totalRevenue"],
                               dimensions=[_GROUPS[group]], dates=self._dates(p), filters=p.get("filters"),
                               limit=as_int(p.get("limit"), 25, lo=1, hi=10000))

    async def _conversions(self, p: dict[str, Any]) -> dict[str, Any]:
        dates, limit = self._dates(p), as_int(p.get("limit"), 25, lo=1, hi=1000)
        overall = await self._run(metrics=["sessions", "keyEvents", "sessionKeyEventRate", "totalRevenue"],
                                  dimensions=[], dates=dates, limit=1)
        by_event = await self._run(metrics=["keyEvents", "eventCount", "totalRevenue"], dimensions=["eventName"],
                                   dates=dates, limit=200, order_by="keyEvents")
        events = [r for r in by_event["rows"] if (r.get("keyEvents") or 0) > 0][:limit]
        result = {"property_id": self.property_id, "date_range": overall["date_range"],
                  "overall": overall["totals"] or (overall["rows"][0] if overall["rows"] else {}),
                  "key_events": events, "currency": overall.get("currency"),
                  "note": "sessionKeyEventRate is the share of sessions with at least one key event (GA4's conversion rate)."}
        if p.get("by"):
            breakdown = await self._run(metrics=["sessions", "keyEvents", "sessionKeyEventRate", "totalRevenue"],
                                        dimensions=[str(p["by"])], dates=dates, limit=limit)
            result["by"] = {"dimension": p["by"], "rows": breakdown["rows"], "truncated": breakdown["truncated"]}
        return result

    async def _metadata(self, p: dict[str, Any]) -> dict[str, Any]:
        data = await self._call("GET", "/metadata")
        needle = str(p.get("search") or "").lower()

        def keep(item: dict[str, Any]) -> bool:
            return not needle or needle in item.get("apiName", "").lower() or needle in item.get("uiName", "").lower()

        dims = [{"apiName": d.get("apiName"), "uiName": d.get("uiName"), "category": d.get("category"),
                 **({"custom": True} if d.get("customDefinition") else {})} for d in data.get("dimensions") or [] if keep(d)]
        mets = [{"apiName": m.get("apiName"), "uiName": m.get("uiName"), "type": m.get("type"),
                 "category": m.get("category"), **({"custom": True} if m.get("customDefinition") else {})}
                for m in data.get("metrics") or [] if keep(m)]
        return {"dimensions": dims[:200], "metrics": mets[:200], "truncated": len(dims) > 200 or len(mets) > 200}
