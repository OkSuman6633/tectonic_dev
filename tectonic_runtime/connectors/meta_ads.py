"""Meta Ads (Marketing API / Graph API) connector.

Auth: a Graph API access token with ``ads_read`` (and ``ads_management`` to stage campaigns) plus the
ad account id (``act_<digits>``). No username/password: the token is the whole login. An optional App
Secret adds ``appsecret_proof`` for apps that require it.

Reads:  ``insights`` (impressions, reach, clicks, spend, CTR/CPC/CPM, purchases, purchase value, ROAS),
        ``campaigns``, ``account``.
Writes: ``create_campaign`` and ``create_ad_set`` — always created with ``status=PAUSED`` whatever the
        caller asks, then read back and re-paused if Meta reports anything else. Nothing an agent stages
        can spend money until a human activates it in Ads Manager.

The token travels in the ``Authorization`` header only; pagination uses cursors, never Meta's
``paging.next`` URLs (which can embed the token).
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
from typing import Any

import httpx

from .base import (AuthScheme, BaseConnector, Capability, ConnectorError, CredentialField, CredentialsInvalid,
                   as_int, as_list, to_number)
from .http import RetryableResponse

GRAPH_URL = os.getenv("META_GRAPH_API_URL", "https://graph.facebook.com").rstrip("/")
GRAPH_VERSION = os.getenv("META_GRAPH_API_VERSION", "v24.0")

DATE_PRESETS = ["today", "yesterday", "this_week_mon_today", "this_week_sun_today", "last_week_mon_sun",
                "last_week_sun_sat", "last_3d", "last_7d", "last_14d", "last_28d", "last_30d", "last_90d",
                "this_month", "last_month", "this_quarter", "last_quarter", "this_year", "last_year", "maximum"]
LEVELS = ["account", "campaign", "adset", "ad"]
BREAKDOWNS = ["age", "gender", "country", "region", "publisher_platform", "platform_position", "device_platform",
              "impression_device"]
OBJECTIVES = ["OUTCOME_AWARENESS", "OUTCOME_TRAFFIC", "OUTCOME_ENGAGEMENT", "OUTCOME_LEADS",
              "OUTCOME_APP_PROMOTION", "OUTCOME_SALES"]
SPECIAL_AD_CATEGORIES = ["NONE", "EMPLOYMENT", "HOUSING", "CREDIT", "ISSUES_ELECTIONS_POLITICS",
                         "FINANCIAL_PRODUCTS_SERVICES"]
_LEVEL_FIELDS = {
    "account": ["account_id", "account_name"],
    "campaign": ["campaign_id", "campaign_name", "objective"],
    "adset": ["campaign_id", "campaign_name", "adset_id", "adset_name"],
    "ad": ["campaign_id", "campaign_name", "adset_id", "adset_name", "ad_id", "ad_name"],
}
_METRIC_FIELDS = ["impressions", "reach", "frequency", "clicks", "inline_link_clicks", "spend", "ctr", "cpc", "cpm",
                  "actions", "action_values", "purchase_roas"]
# Priority order: Meta reports one purchase several times under different action types.
_PURCHASE_TYPES = ("omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase", "onsite_web_purchase")
_LEAD_TYPES = ("lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead")
_RATE_LIMIT_CODES = {4, 17, 32, 341, 613} | set(range(80000, 80015))
_AUTH_CODES = {102, 190, 10} | set(range(200, 300))
_ACCOUNT_ID = re.compile(r"^(?:act_)?(\d{5,20})$")
_DATE = {"type": "string", "pattern": r"^\d{4}-\d{2}-\d{2}$"}
_BUDGET = {"type": "integer", "minimum": 1,
           "description": "Integer in the ad account currency's smallest unit (cents for USD/EUR: 5000 = 50.00)."}

_INSIGHTS_SCHEMA = {
    "type": "object",
    "properties": {
        "level": {"type": "string", "enum": LEVELS, "description": "Aggregation level. Default campaign."},
        "date_preset": {"type": "string", "enum": DATE_PRESETS,
                        "description": "Relative date range (default last_7d). Ignored when since/until are given."},
        "since": {**_DATE, "description": "Start date YYYY-MM-DD (use with until)."},
        "until": {**_DATE, "description": "End date YYYY-MM-DD, inclusive."},
        "time_increment": {"type": "string", "enum": ["all_days", "1", "7", "monthly"],
                           "description": "Split rows by day ('1'), week ('7') or month. Default all_days (one row per object)."},
        "breakdowns": {"type": "array", "items": {"type": "string", "enum": BREAKDOWNS},
                       "description": "Optional audience/placement breakdowns."},
        "campaign_ids": {"type": "array", "items": {"type": "string"},
                         "description": "Only these campaigns (ids from meta_ads_campaigns)."},
        "extra_fields": {"type": "array", "items": {"type": "string"},
                         "description": "Additional Insights fields, e.g. cost_per_action_type, website_purchase_roas."},
        "limit": {"type": "integer", "minimum": 1, "maximum": 1000, "description": "Maximum rows (default 100)."},
    },
}
_CAMPAIGNS_SCHEMA = {
    "type": "object",
    "properties": {
        "statuses": {"type": "array", "items": {"type": "string", "enum": ["ACTIVE", "PAUSED", "ARCHIVED", "IN_PROCESS", "WITH_ISSUES"]},
                     "description": "Filter by effective status (default ACTIVE and PAUSED)."},
        "limit": {"type": "integer", "minimum": 1, "maximum": 500, "description": "Maximum campaigns (default 100)."},
    },
}
_CREATE_CAMPAIGN_SCHEMA = {
    "type": "object",
    "properties": {
        "name": {"type": "string", "minLength": 1, "maxLength": 400},
        "objective": {"type": "string", "enum": OBJECTIVES, "description": "ODAX campaign objective."},
        "special_ad_categories": {"type": "array", "items": {"type": "string", "enum": SPECIAL_AD_CATEGORIES},
                                  "description": "Declare HOUSING/EMPLOYMENT/CREDIT/... when they apply. Default none."},
        "daily_budget": {**_BUDGET, "description": "Campaign daily budget (Advantage+ campaign budget). " + _BUDGET["description"]},
        "lifetime_budget": {**_BUDGET, "description": "Campaign lifetime budget. " + _BUDGET["description"]},
        "bid_strategy": {"type": "string", "enum": ["LOWEST_COST_WITHOUT_CAP", "LOWEST_COST_WITH_BID_CAP", "COST_CAP",
                                                     "LOWEST_COST_WITH_MIN_ROAS"]},
        "dry_run": {"type": "boolean", "description": "Validate and return the request without calling Meta."},
    },
    "required": ["name", "objective"],
}
_CREATE_AD_SET_SCHEMA = {
    "type": "object",
    "properties": {
        "campaign_id": {"type": "string", "description": "Parent campaign id."},
        "name": {"type": "string", "minLength": 1, "maxLength": 400},
        "optimization_goal": {"type": "string", "description": "e.g. LINK_CLICKS, REACH, OFFSITE_CONVERSIONS, LEAD_GENERATION, LANDING_PAGE_VIEWS."},
        "billing_event": {"type": "string", "enum": ["IMPRESSIONS", "LINK_CLICKS", "THRUPLAY"], "description": "Default IMPRESSIONS."},
        "targeting": {"type": "object", "description": "Meta targeting spec; must include geo_locations, e.g. "
                                                       "{\"geo_locations\": {\"countries\": [\"US\"]}, \"age_min\": 25}."},
        "daily_budget": _BUDGET,
        "lifetime_budget": _BUDGET,
        "bid_amount": {"type": "integer", "minimum": 1, "description": "Bid cap in the smallest currency unit (bid-cap strategies only)."},
        "bid_strategy": {"type": "string", "enum": ["LOWEST_COST_WITHOUT_CAP", "LOWEST_COST_WITH_BID_CAP", "COST_CAP"]},
        "start_time": {"type": "string", "description": "ISO-8601 start, e.g. 2026-12-01T09:00:00+0000."},
        "end_time": {"type": "string", "description": "ISO-8601 end (required with lifetime_budget)."},
        "promoted_object": {"type": "object", "description": "e.g. {\"pixel_id\": \"…\", \"custom_event_type\": \"PURCHASE\"} for conversions."},
        "dry_run": {"type": "boolean", "description": "Validate and return the request without calling Meta."},
    },
    "required": ["campaign_id", "name", "optimization_goal", "targeting"],
}


class MetaAdsConnector(BaseConnector):
    name = "meta_ads"
    label = "Meta Ads"
    tool_prefix = "meta_ads"
    description = "Facebook & Instagram ad performance (Marketing API Insights) and staging of paused campaigns."
    docs_url = "https://developers.facebook.com/docs/marketing-api/get-started/authorization"
    auth_schemes = (
        AuthScheme(
            id="access_token",
            label="Access token",
            instructions=("Create a token in Meta Business Settings → Users → System users → Generate new token "
                          "(or Graph API Explorer) with the ads_read permission — add ads_management if agents may "
                          "stage paused campaigns. Your ad account id is in Ads Manager's account switcher."),
            fields=(
                CredentialField("access_token", "Graph API access token", secret=True, kind="password",
                                placeholder="EAAG…", help="Never shared with the AI model; stored encrypted for this session."),
                CredentialField("ad_account_id", "Ad account ID", secret=False, kind="text", placeholder="act_123456789",
                                pattern=r"(?:act_)?\d{5,20}", help="With or without the act_ prefix."),
                CredentialField("app_secret", "App secret (optional)", secret=True, required=False, kind="password",
                                help="Only if your Meta app enforces 'Require App Secret' (adds appsecret_proof)."),
            ),
        ),
    )
    capabilities = (
        Capability("insights", "read",
                   "Ad performance from the Meta Insights API: impressions, reach, clicks, spend, CTR, CPC, CPM, "
                   "purchases, purchase value and ROAS, per account/campaign/ad set/ad, with totals.",
                   _INSIGHTS_SCHEMA),
        Capability("campaigns", "read", "List the ad account's campaigns with status, objective and budgets.",
                   _CAMPAIGNS_SCHEMA),
        Capability("account", "read", "The connected ad account: name, currency, time zone and status.",
                   {"type": "object", "properties": {}}),
        Capability("create_campaign", "write",
                   "Stage a new campaign. It is ALWAYS created PAUSED (no spend) for a human to review and activate "
                   "in Ads Manager. Returns its id and a review link.", _CREATE_CAMPAIGN_SCHEMA),
        Capability("create_ad_set", "write",
                   "Stage a new ad set in a campaign. ALWAYS created PAUSED for human review.", _CREATE_AD_SET_SCHEMA),
    )

    # --- credentials ----------------------------------------------------------------------------
    @classmethod
    def normalize_credentials(cls, scheme_id: str, values: dict[str, Any]) -> dict[str, str]:
        clean = super().normalize_credentials(scheme_id, values)
        match = _ACCOUNT_ID.match(clean["ad_account_id"])
        clean["ad_account_id"] = f"act_{match.group(1)}" if match else clean["ad_account_id"]
        return clean

    @property
    def account_id(self) -> str:
        return self.credentials.require("ad_account_id")

    # --- HTTP -------------------------------------------------------------------------------------
    def _url(self, path: str) -> str:
        return f"{GRAPH_URL}/{GRAPH_VERSION}/{path.lstrip('/')}"

    def _auth(self, params: dict[str, Any] | None) -> tuple[dict[str, str], dict[str, Any]]:
        token = self.credentials.require("access_token")
        params = dict(params or {})
        secret = self.credentials.get("app_secret")
        if secret:
            params["appsecret_proof"] = hmac.new(secret.encode(), token.encode(), hashlib.sha256).hexdigest()
        return {"Authorization": f"Bearer {token}", "Accept": "application/json"}, params

    @staticmethod
    def _error(response: httpx.Response) -> dict[str, Any]:
        try:
            body = response.json()
        except ValueError:
            return {}
        return body.get("error") or {} if isinstance(body, dict) else {}

    def _check(self, response: httpx.Response) -> None:
        if response.status_code < 400:
            return
        err = self._error(response)
        if err.get("code") in _RATE_LIMIT_CODES or err.get("is_transient"):
            raise RetryableResponse(response)

    async def _call(self, method: str, path: str, *, params: dict[str, Any] | None = None,
                    data: dict[str, Any] | None = None, auth_check: bool = False) -> Any:
        headers, params = self._auth(params)
        response = await self.http.request(method, self._url(path), headers=headers, params=params,
                                           data=data, check=self._check)
        if response.status_code < 400:
            try:
                return response.json()
            except ValueError:
                raise ConnectorError("Meta returned a non-JSON response", status=response.status_code) from None
        err = self._error(response)
        code, subcode = err.get("code"), err.get("error_subcode")
        message = err.get("error_user_msg") or err.get("message") or f"HTTP {response.status_code}"
        detail = f"Meta API error {code or response.status_code}" + (f"/{subcode}" if subcode else "") + f": {message}"
        if code in _AUTH_CODES or response.status_code == 401:
            raise CredentialsInvalid(detail + " — the token is expired, revoked or lacks ads_read/ads_management "
                                     "permission for this ad account.", status=response.status_code)
        if auth_check and code == 100:  # unknown object: wrong ad account id, or no access to it
            raise CredentialsInvalid(f"{detail} — check the ad account id and that the token's user/system user "
                                     "has access to it.", status=response.status_code)
        if code in _RATE_LIMIT_CODES or response.status_code == 429:
            raise ConnectorError(detail + " — Meta rate limit reached; wait a few minutes.", code="rate_limited",
                                 status=response.status_code, retryable=True)
        if code == 100:  # invalid parameter / unknown field or object: the caller's request to fix
            raise ConnectorError(detail, code="invalid_parameters", status=response.status_code)
        raise ConnectorError(detail, code="upstream_error", status=response.status_code)

    # --- operations -----------------------------------------------------------------------------
    async def authenticate(self) -> dict[str, Any]:
        data = await self._call("GET", self.account_id, auth_check=True, params={
            "fields": "id,account_id,name,account_status,currency,timezone_name,business_name,amount_spent"})
        status_names = {1: "ACTIVE", 2: "DISABLED", 3: "UNSETTLED", 7: "PENDING_RISK_REVIEW", 8: "PENDING_SETTLEMENT",
                        9: "IN_GRACE_PERIOD", 100: "PENDING_CLOSURE", 101: "CLOSED", 201: "ANY_ACTIVE", 202: "ANY_CLOSED"}
        return {"account_id": data.get("id") or self.account_id, "account_name": data.get("name"),
                "business_name": data.get("business_name"), "currency": data.get("currency"),
                "timezone": data.get("timezone_name"),
                "account_status": status_names.get(data.get("account_status"), data.get("account_status"))}

    async def fetch_data(self, resource: str, params: dict[str, Any]) -> dict[str, Any]:
        self.capability(resource, "read")
        if resource == "account":
            return await self.authenticate()
        if resource == "campaigns":
            return await self._campaigns(params)
        return await self._insights(params)

    async def execute_action(self, action: str, params: dict[str, Any]) -> dict[str, Any]:
        self.capability(action, "write")
        if action == "create_campaign":
            return await self._create_campaign(params)
        return await self._create_ad_set(params)

    async def _paged(self, path: str, params: dict[str, Any], limit: int) -> tuple[list[dict[str, Any]], bool]:
        rows: list[dict[str, Any]] = []
        after: str | None = None
        while True:
            page_params = {**params, "limit": min(500, limit - len(rows))}
            if after:
                page_params["after"] = after
            body = await self._call("GET", path, params=page_params)
            rows.extend(body.get("data") or [])
            after = ((body.get("paging") or {}).get("cursors") or {}).get("after")
            has_next = bool((body.get("paging") or {}).get("next"))
            if len(rows) >= limit or not after or not has_next:
                return rows[:limit], has_next and len(rows) >= limit

    async def _insights(self, p: dict[str, Any]) -> dict[str, Any]:
        level = p.get("level") or "campaign"
        if level not in LEVELS:
            raise ConnectorError(f"level must be one of {LEVELS}", code="invalid_parameters")
        fields = list(dict.fromkeys(_LEVEL_FIELDS[level] + _METRIC_FIELDS + as_list(p.get("extra_fields"))))
        params: dict[str, Any] = {"level": level, "fields": ",".join(fields)}
        since, until = p.get("since"), p.get("until")
        if since or until:
            if not (since and until):
                raise ConnectorError("give both since and until (YYYY-MM-DD), or a date_preset", code="invalid_parameters")
            params["time_range"] = json.dumps({"since": since, "until": until})
            period = {"since": since, "until": until}
        else:
            preset = p.get("date_preset") or "last_7d"
            if preset not in DATE_PRESETS:
                raise ConnectorError(f"date_preset must be one of {DATE_PRESETS}", code="invalid_parameters")
            params["date_preset"] = preset
            period = {"date_preset": preset}
        increment = str(p.get("time_increment") or "all_days")
        if increment != "all_days":
            params["time_increment"] = increment
        breakdowns = as_list(p.get("breakdowns"))
        if breakdowns:
            params["breakdowns"] = ",".join(breakdowns)
        campaign_ids = as_list(p.get("campaign_ids"))
        if campaign_ids:
            params["filtering"] = json.dumps([{"field": "campaign.id", "operator": "IN", "value": campaign_ids}])
        limit = as_int(p.get("limit"), 100, lo=1, hi=1000)

        raw, truncated = await self._paged(f"{self.account_id}/insights", params, limit)
        rows = [self._insight_row(r) for r in raw]
        return {"level": level, "period": period, "time_increment": increment, "breakdowns": breakdowns,
                "row_count": len(rows), "truncated": truncated, "totals": self._totals(rows), "rows": rows}

    @staticmethod
    def _action_map(items: Any) -> dict[str, Any]:
        return {i["action_type"]: to_number(i.get("value")) for i in items or [] if isinstance(i, dict) and "action_type" in i}

    @staticmethod
    def _pick(mapping: dict[str, Any], types: tuple[str, ...]) -> float:
        for t in types:
            if t in mapping and isinstance(mapping[t], (int, float)):
                return float(mapping[t])
        return 0.0

    def _insight_row(self, raw: dict[str, Any]) -> dict[str, Any]:
        row = {k: to_number(v) for k, v in raw.items() if k not in ("actions", "action_values", "purchase_roas",
                                                                       "website_purchase_roas", "cost_per_action_type")}
        actions = self._action_map(raw.get("actions"))
        values = self._action_map(raw.get("action_values"))
        purchases = self._pick(actions, _PURCHASE_TYPES)
        purchase_value = self._pick(values, _PURCHASE_TYPES)
        spend = float(row.get("spend") or 0)
        reported = self._action_map(raw.get("purchase_roas"))
        roas = self._pick(reported, _PURCHASE_TYPES) or (round(purchase_value / spend, 4) if spend else None)
        row.update(purchases=purchases, purchase_value=round(purchase_value, 2), roas=roas,
                   leads=self._pick(actions, _LEAD_TYPES))
        if actions:
            row["actions"] = dict(sorted(actions.items(), key=lambda kv: -float(kv[1] or 0))[:12])
        for extra in ("website_purchase_roas", "cost_per_action_type"):
            if raw.get(extra):
                row[extra] = self._action_map(raw[extra])
        return row

    @staticmethod
    def _totals(rows: list[dict[str, Any]]) -> dict[str, Any]:
        def total(key: str) -> float:
            return sum(float(r.get(key) or 0) for r in rows if isinstance(r.get(key), (int, float)))

        impressions, clicks, spend = total("impressions"), total("clicks"), total("spend")
        purchase_value = total("purchase_value")
        return {"impressions": int(impressions), "clicks": int(clicks), "spend": round(spend, 2),
                "purchases": total("purchases"), "purchase_value": round(purchase_value, 2), "leads": total("leads"),
                "ctr": round(clicks / impressions * 100, 4) if impressions else None,
                "cpc": round(spend / clicks, 4) if clicks else None,
                "cpm": round(spend / impressions * 1000, 4) if impressions else None,
                "roas": round(purchase_value / spend, 4) if spend else None}

    async def _campaigns(self, p: dict[str, Any]) -> dict[str, Any]:
        statuses = as_list(p.get("statuses")) or ["ACTIVE", "PAUSED"]
        limit = as_int(p.get("limit"), 100, lo=1, hi=500)
        rows, truncated = await self._paged(f"{self.account_id}/campaigns", {
            "fields": "id,name,status,effective_status,objective,daily_budget,lifetime_budget,budget_remaining,"
                      "start_time,stop_time,created_time",
            "effective_status": json.dumps(statuses)}, limit)
        return {"count": len(rows), "truncated": truncated,
                "campaigns": [{k: to_number(v) if k.endswith("budget") or k == "budget_remaining" else v
                               for k, v in r.items()} for r in rows]}

    # --- writes: always PAUSED ------------------------------------------------------------------
    def _review_url(self, campaign_id: str) -> str:
        return (f"https://adsmanager.facebook.com/adsmanager/manage/campaigns?act={self.account_id.removeprefix('act_')}"
                f"&selected_campaign_ids={campaign_id}")

    async def _ensure_paused(self, object_id: str) -> dict[str, Any]:
        """Read the new object back; if Meta reports any status but PAUSED, pause it immediately."""
        obj = await self._call("GET", object_id, params={"fields": "id,name,status,effective_status"})
        if obj.get("status") != "PAUSED":
            await self._call("POST", object_id, data={"status": "PAUSED"})
            obj = {**obj, "status": "PAUSED", "repaused": True}
        return obj

    async def _create_campaign(self, p: dict[str, Any]) -> dict[str, Any]:
        name = str(p.get("name") or "").strip()
        objective = p.get("objective")
        if not name:
            raise ConnectorError("name is required", code="invalid_parameters")
        if objective not in OBJECTIVES:
            raise ConnectorError(f"objective must be one of {OBJECTIVES}", code="invalid_parameters")
        categories = [c for c in as_list(p.get("special_ad_categories")) if c != "NONE"]
        bad = [c for c in categories if c not in SPECIAL_AD_CATEGORIES]
        if bad:
            raise ConnectorError(f"unknown special_ad_categories {bad}", code="invalid_parameters")
        payload: dict[str, Any] = {"name": name, "objective": objective, "status": "PAUSED",
                                   "special_ad_categories": json.dumps(categories)}
        budget = False
        for key in ("daily_budget", "lifetime_budget"):
            if p.get(key) not in (None, ""):
                payload[key] = str(as_int(p[key], 0, lo=1, hi=10**12))
                budget = True
        if p.get("bid_strategy"):
            payload["bid_strategy"] = p["bid_strategy"]
        if not budget:
            # Ad-set budgets: Marketing API v22+ requires this flag when the campaign has no budget.
            payload["is_adset_budget_sharing_enabled"] = "false"
        notes = ["status forced to PAUSED: activate it in Ads Manager after review"] if p.get("status") not in (None, "", "PAUSED") else []
        path = f"{self.account_id}/campaigns"
        if p.get("dry_run"):
            return {"dry_run": True, "endpoint": f"POST /{GRAPH_VERSION}/{path}", "payload": payload, "notes": notes}
        created = await self._call("POST", path, data=payload)
        campaign_id = str(created.get("id") or "")
        if not campaign_id:
            raise ConnectorError("Meta did not return a campaign id", code="upstream_error")
        state = await self._ensure_paused(campaign_id)
        return {"campaign_id": campaign_id, "name": name, "objective": objective, "status": state.get("status"),
                "review_url": self._review_url(campaign_id), "notes": notes + (
                    ["Meta reported a non-paused status; it was paused again"] if state.get("repaused") else [])}

    async def _create_ad_set(self, p: dict[str, Any]) -> dict[str, Any]:
        for required in ("campaign_id", "name", "optimization_goal"):
            if not str(p.get(required) or "").strip():
                raise ConnectorError(f"{required} is required", code="invalid_parameters")
        targeting = p.get("targeting")
        if isinstance(targeting, str):
            try:
                targeting = json.loads(targeting)
            except ValueError:
                raise ConnectorError("targeting must be a JSON object", code="invalid_parameters") from None
        if not isinstance(targeting, dict) or not targeting.get("geo_locations"):
            raise ConnectorError("targeting must be an object that includes geo_locations", code="invalid_parameters")
        payload: dict[str, Any] = {
            "campaign_id": str(p["campaign_id"]), "name": str(p["name"]).strip(), "status": "PAUSED",
            "optimization_goal": str(p["optimization_goal"]), "billing_event": p.get("billing_event") or "IMPRESSIONS",
            "bid_strategy": p.get("bid_strategy") or "LOWEST_COST_WITHOUT_CAP", "targeting": json.dumps(targeting)}
        for key in ("daily_budget", "lifetime_budget", "bid_amount"):
            if p.get(key) not in (None, ""):
                payload[key] = str(as_int(p[key], 0, lo=1, hi=10**12))
        for key in ("start_time", "end_time"):
            if p.get(key):
                payload[key] = str(p[key])
        if p.get("promoted_object"):
            obj = p["promoted_object"]
            payload["promoted_object"] = obj if isinstance(obj, str) else json.dumps(obj)
        if "lifetime_budget" in payload and "end_time" not in payload:
            raise ConnectorError("end_time is required with lifetime_budget", code="invalid_parameters")
        path = f"{self.account_id}/adsets"
        if p.get("dry_run"):
            return {"dry_run": True, "endpoint": f"POST /{GRAPH_VERSION}/{path}", "payload": payload}
        created = await self._call("POST", path, data=payload)
        ad_set_id = str(created.get("id") or "")
        if not ad_set_id:
            raise ConnectorError("Meta did not return an ad set id", code="upstream_error")
        state = await self._ensure_paused(ad_set_id)
        return {"ad_set_id": ad_set_id, "campaign_id": payload["campaign_id"], "name": payload["name"],
                "status": state.get("status"), "review_url": self._review_url(payload["campaign_id"])}
