"""Web research: competitor discovery, brand profile resolution and general searches.

Search runs through a provider chain and stops at the first one that returns results:

1. Tavily          - when ``TAVILY_API_KEY`` is set (free tier, fast).
2. Apify Google    - ``apify/google-search-scraper`` with the project's ``APIFY_TOKEN`` (small credit cost,
                     the most reliable option and the one used by default).
3. DuckDuckGo HTML - no key, no cost, but it is rate limited under load.
4. Bing HTML       - last resort, best effort.

Brand profiles are resolved from the brand's own website (the most reliable source for real handles) and
only fall back to search results and name-based guesses, each clearly marked with its confidence.
"""

from __future__ import annotations

import base64
import html
import json
import os
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from ..shared_libraries.constants import SEARCH_TIMEOUT_SECONDS
from .apify_client import ApifyError, run_actor

_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)
_TAG = re.compile(r"<[^>]+>")
_UDDG = re.compile(r"uddg=([^&\"]+)")
_BING_REDIRECT = re.compile(r"[?&]u=a1([A-Za-z0-9_\-=]+)")
_INSTAGRAM = re.compile(r"instagram\.com/([A-Za-z0-9_.]+)")
_YOUTUBE = re.compile(r"youtube\.com/(@[A-Za-z0-9_.-]+|c/[A-Za-z0-9_.-]+|channel/[A-Za-z0-9_-]+|user/[A-Za-z0-9_.-]+)")
_FACEBOOK = re.compile(r"facebook\.com/([A-Za-z0-9_.\-]+)")
_HEADING = re.compile(r"<h[23][^>]*>(.*?)</h[23]>", re.S)
_STRONG = re.compile(r"<(?:strong|b)[^>]*>([^<>]{3,60})</(?:strong|b)>", re.I)
_LEADING_MARKER = re.compile(r"^[\s\d.,:)\-–—#|&*•]*")
# Section headings that appear on ranked lists but are not brands.
_NOISE_HEADINGS = {
    "methodology", "recommended", "related", "table of contents", "how we tested", "our favourites",
    "our favorites", "final thoughts", "conclusion", "the bottom line", "frequently asked questions",
    "faq", "key takeaways", "why trust us", "sources", "references", "newsletter", "popular recipes",
    "reader interactions", "primary sidebar", "footer", "recipes", "important", "coffee creamers",
    "my personal favorites", "my personal favourites", "shop all", "browse all", "you may also like",
}

# Instagram / Facebook path segments that are never a profile or page name.
_RESERVED = {
    "p", "reel", "reels", "stories", "story", "tv", "explore", "popular", "accounts", "about", "directory",
    "developer", "legal", "web", "challenge", "share", "watch", "groups", "events", "marketplace", "photo",
    "photo.php", "permalink.php", "login", "help", "policies", "business", "ads", "hashtag", "audio", "tags",
    "tr", "plugins", "sharer.php", "profile.php", "pages", "media", "video", "videos", "shorts", "sharer",
    "dialog", "connect", "watchparty", "recover", "checkpoint", "privacy", "terms", "cookies",
}
# Sites that are never a competitor brand or an official site.
_DIRECTORIES = {
    "wikipedia.org", "linkedin.com", "reddit.com", "youtube.com", "instagram.com", "facebook.com", "twitter.com",
    "x.com", "tiktok.com", "pinterest.com", "amazon.com", "medium.com", "quora.com", "glassdoor.com",
    "indeed.com", "crunchbase.com", "bloomberg.com", "statista.com", "forbes.com", "shopify.com",
    "google.com", "duckduckgo.com", "bing.com", "yelp.com", "trustpilot.com", "github.com", "cnet.com",
    "tripadvisor.com", "walmart.com", "target.com", "ebay.com", "apple.com", "play.google.com",
}
# Words that start a sentence far more often than they name a brand.
_STOPWORDS = {
    "the", "this", "that", "these", "those", "here", "there", "when", "what", "why", "how", "where", "which",
    "who", "our", "your", "their", "his", "her", "its", "we", "you", "they", "it", "and", "but", "for", "with",
    "from", "into", "over", "under", "about", "after", "before", "best", "top", "new", "more", "most", "all",
    "some", "any", "every", "each", "other", "another", "read", "learn", "discover", "find", "get", "make",
    "see", "shop", "buy", "sale", "free", "review", "reviews", "list", "guide", "blog", "news", "home",
    "contact", "privacy", "terms", "cookies", "search", "menu", "login", "sign", "account", "cart", "image",
    "photo", "video", "story", "overwhelmed", "instead", "because", "while", "since", "however", "although",
    "usda", "organic", "vegan", "gluten", "dairy", "milk", "products", "product", "brands", "brand",
    "companies", "company", "market", "industry", "report", "data", "january", "february", "march", "april",
    "may", "june", "july", "august", "september", "october", "november", "december", "monday", "tuesday",
    "wednesday", "thursday", "friday", "saturday", "sunday", "instagram", "facebook", "youtube", "tiktok",
    "linkedin", "twitter", "follow", "subscribe", "comments", "related", "featured", "official",
    "hi", "hello", "hey", "note", "save", "quick", "summary", "results", "table", "nutrition", "taste",
    "benefits", "fall", "summer", "winter", "spring", "recipes", "recipe", "ingredients", "directions",
}
_cache: dict[str, list[dict]] = {}
_cache_lock = threading.Lock()


class SearchError(RuntimeError):
    """A search request failed; the message is safe to show to the user."""


def _error(message: str) -> dict:
    """Build a standard error response."""
    return {"status": "error", "message": message}


def _strip_tags(value: str) -> str:
    """Remove HTML tags and decode entities, collapsing whitespace."""
    return " ".join(html.unescape(_TAG.sub(" ", value or "")).split())


def _http(url: str, data: bytes | None = None, headers: dict | None = None,
          timeout: int = SEARCH_TIMEOUT_SECONDS) -> str | None:
    """Fetch a URL and return its text body, or None when it cannot be read.

    Args:
        url: Absolute URL.
        data: Optional request body (makes it a POST).
        headers: Extra request headers.
        timeout: Timeout in seconds.

    Returns:
        The decoded body, or None on any network/HTTP error.
    """
    request = urllib.request.Request(
        url, data=data, headers={"User-Agent": _USER_AGENT, "Accept-Language": "en-US,en;q=0.9", **(headers or {})}
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.read().decode("utf-8", "replace")
    except (urllib.error.URLError, TimeoutError, ValueError):
        return None


def _tavily(query: str, max_results: int) -> list[dict]:
    """Search with the Tavily API when a key is configured."""
    key = (os.getenv("TAVILY_API_KEY") or "").strip()
    if not key:
        return []
    body = json.dumps({"api_key": key, "query": query, "max_results": max_results,
                       "include_answer": False}).encode("utf-8")
    raw = _http("https://api.tavily.com/search", data=body, headers={"Content-Type": "application/json"})
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return []
    return [
        {"title": r.get("title", ""), "url": r.get("url", ""), "snippet": (r.get("content") or "")[:400]}
        for r in parsed.get("results", [])
    ]


def _apify_google(query: str, max_results: int) -> list[dict]:
    """Search Google through the Apify Google Search Scraper actor."""
    try:
        run = run_actor(
            "google_search",
            {"queries": query, "maxPagesPerQuery": 1, "saveHtmlToKeyValueStore": False},
            wait_seconds=120,
            limit=1,
            memory_mbytes=2048,
        )
    except ApifyError:
        return []
    results: list[dict] = []
    for page in run.get("items") or []:
        for organic in page.get("organicResults") or []:
            url = organic.get("url") or ""
            if not url:
                continue
            results.append({
                "title": organic.get("title") or "",
                "url": url,
                "snippet": (organic.get("description") or "")[:400],
            })
            if len(results) >= max_results:
                return results
    return results


def _decode_ddg_url(raw: str) -> str:
    """Resolve a DuckDuckGo redirect link to the target URL."""
    if raw.startswith("//"):
        raw = "https:" + raw
    if "duckduckgo.com/l/" not in raw:
        return raw
    match = _UDDG.search(raw)
    return urllib.parse.unquote(match.group(1)) if match else raw


def _decode_bing_url(raw: str) -> str:
    """Resolve a Bing redirect link (``/ck/a?...&u=a1<base64>``) to the target URL."""
    candidate = html.unescape(raw or "")
    match = _BING_REDIRECT.search(candidate)
    if not match:
        return candidate
    encoded = match.group(1).replace("_", "/").replace("-", "+")
    encoded += "=" * (-len(encoded) % 4)
    try:
        return base64.urlsafe_b64decode(encoded).decode("utf-8", "ignore") or candidate
    except (ValueError, RuntimeError):
        return candidate


def _duckduckgo(query: str, max_results: int) -> list[dict]:
    """Search the no-key DuckDuckGo HTML endpoint (may be rate limited)."""
    body = _http("https://html.duckduckgo.com/html/?q=" + urllib.parse.quote(query))
    if not body:
        return []
    results: list[dict] = []
    links = re.findall(r'class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)</a>', body, re.S)
    snippets = re.findall(r'class="result__snippet"[^>]*>(.*?)</a>', body, re.S)
    for index, (href, title) in enumerate(links[:max_results]):
        results.append({
            "title": _strip_tags(title),
            "url": _decode_ddg_url(href),
            "snippet": _strip_tags(snippets[index]) if index < len(snippets) else "",
        })
    return results


def _bing(query: str, max_results: int) -> list[dict]:
    """Search the no-key Bing HTML endpoint (best effort)."""
    body = _http("https://www.bing.com/search?q=" + urllib.parse.quote(query))
    if not body:
        return []
    results: list[dict] = []
    for block in re.findall(r'<li class="b_algo".*?</li>', body, re.S)[:max_results]:
        heading = re.search(r"<h2>.*?<a[^>]*href=\"([^\"]+)\"[^>]*>(.*?)</a>", block, re.S)
        if not heading:
            continue
        snippet = re.search(r"<p[^>]*>(.*?)</p>", block, re.S)
        results.append({
            "title": _strip_tags(heading.group(2)),
            "url": _decode_bing_url(heading.group(1)),
            "snippet": _strip_tags(snippet.group(1)) if snippet else "",
        })
    return results


def _provider_chain() -> list[str]:
    """The search providers to try, in order (``SMCIA_SEARCH_PROVIDER`` forces one)."""
    forced = (os.getenv("SMCIA_SEARCH_PROVIDER") or "auto").strip().lower()
    if forced != "auto":
        return [forced]
    chain = []
    if (os.getenv("TAVILY_API_KEY") or "").strip():
        chain.append("tavily")
    if any((os.getenv(name) or "").strip() for name in ("APIFY_TOKEN", "APIFY_API_TOKEN", "APIFY_API_KEY")):
        chain.append("apify")
    chain.extend(["duckduckgo", "bing"])
    return chain


def _search(query: str, max_results: int) -> tuple[list[dict], str]:
    """Run a query through the provider chain, caching the outcome per query.

    Returns:
        Tuple of (results, provider name); provider is "cache" for a cache hit and "" when nothing worked.
    """
    key = f"{query.strip().lower()}|{max_results}"
    with _cache_lock:
        cached = _cache.get(key)
    if cached is not None:
        return [dict(item) for item in cached], "cache"

    handlers = {"tavily": _tavily, "apify": _apify_google, "duckduckgo": _duckduckgo, "bing": _bing}
    for provider in _provider_chain():
        handler = handlers.get(provider)
        if handler is None:
            continue
        try:
            results = handler(query, max_results)
        except (SearchError, urllib.error.URLError):
            results = []
        if results:
            with _cache_lock:
                _cache[key] = [dict(item) for item in results]
            return results, provider
        time.sleep(0.4)
    return [], ""


def search_web(query: str, max_results: int = 6) -> dict:
    """Search the web and return ranked results with titles, URLs and snippets.

    Args:
        query: The search phrase.
        max_results: Results to return, between 1 and 10. Defaults to 6.

    Returns:
        dict with status, the query, the provider used and results [{title, url, snippet}].
    """
    try:
        text = (query or "").strip()
        if not text:
            return _error("query is required.")
        capped = max(1, min(int(max_results), 10))
        results, provider = _search(text, capped)
        if not results:
            return {"status": "empty", "query": text, "provider": "", "results": [],
                    "message": "No web results came back; rely on industry knowledge and say so."}
        return {"status": "success", "query": text, "provider": provider, "results": results}
    except (TypeError, ValueError) as exc:
        return _error(str(exc))


def _fetch_page_text(url: str, limit: int = 12000) -> str:
    """Fetch a page and return its visible text, capped.

    Args:
        url: Page URL.
        limit: Maximum characters to keep.

    Returns:
        The page text, or an empty string when the page cannot be read.
    """
    body = _http(url, timeout=SEARCH_TIMEOUT_SECONDS)
    if not body:
        return ""
    body = re.sub(r"(?is)<(script|style|noscript)[^>]*>.*?</\1>", " ", body)
    return " ".join(_strip_tags(body).split())[:limit]


def _is_directory(url: str) -> bool:
    """True when a URL belongs to a directory, marketplace or social network."""
    lowered = (url or "").lower()
    return any(site in lowered for site in _DIRECTORIES)


def _brand_like(name: str) -> bool:
    """True when a phrase looks like a brand name rather than a sentence fragment."""
    clean = (name or "").strip(" .,:;|-'’")
    words = clean.split()
    if not clean or len(clean) < 3 or len(words) > 3:
        return False
    if any(char.isdigit() for char in clean) or "." in clean or "!" in clean or "?" in clean:
        return False
    if not clean[0].isupper():
        return False
    if any(word.lower().strip(".,") in _STOPWORDS for word in words):
        return False
    return True


def _visible_text(body: str, limit: int = 3200) -> str:
    """Return the visible text of an HTML page, preferring the main article and dropping navigation.
    """
    if not body:
        return ""
    cleaned = re.sub(r"(?is)<(script|style|noscript|nav|header|footer)[^>]*>.*?</\1>", " ", body)
    article = re.search(r"(?is)<article[^>]*>(.*?)</article>", cleaned) or \
        re.search(r"(?is)<main[^>]*>(.*?)</main>", cleaned)
    if article:
        cleaned = article.group(1)
    return " ".join(_strip_tags(cleaned).split())[:limit]


def _candidates_from_body(body: str, industry_words: set[str], limit: int = 15) -> list[str]:
    """Extract brand-like names from an already fetched ranked list page.

    Ranked reviews put each brand in a heading ("1. Mooala") or a bold lead-in, so headings are the
    reliable signal; navigation and section titles are filtered out.

    Args:
        body: The page HTML.
        industry_words: Words describing the category rather than a brand.
        limit: Maximum candidates to return.

    Returns:
        Candidate names in order of appearance.
    """
    if not body:
        return []
    found: list[str] = []
    for match in list(_HEADING.findall(body)) + list(_STRONG.findall(body)):
        name = _LEADING_MARKER.sub("", _strip_tags(match)).strip(" .:-–—|*•")
        if not _brand_like(name) or name.isupper():
            continue
        if name.lower() in _NOISE_HEADINGS:
            continue
        if any(word.lower().strip(".,") in industry_words for word in name.split()):
            continue
        if name not in found:
            found.append(name)
        if len(found) >= limit:
            break
    return found


def _candidates_from_page(url: str, industry_words: set[str], limit: int = 15) -> list[str]:
    """Fetch one page and extract its brand-like names.

    Args:
        url: Page to read.
        industry_words: Words describing the category rather than a brand.
        limit: Maximum candidates to return.

    Returns:
        Candidate names in order of appearance.
    """
    return _candidates_from_body(_http(url, timeout=SEARCH_TIMEOUT_SECONDS) or "", industry_words, limit)


def discover_competitors(company: str, industry: str, region: str = "", max_competitors: int = 5) -> dict:
    """Find direct competitors for a company in its niche, with the web evidence behind each candidate.

    Args:
        company: The user's company name.
        industry: The primary industry or niche, for example 'plant-based milk'.
        region: Optional market or country to narrow the search, for example 'US'.
        max_competitors: How many competitors to aim for, between 3 and 5. Defaults to 5.

    Returns:
        dict with status, suggested_competitors (candidates to confirm), evidence (ranked search results
        per query), suggested_searches (YouTube phrases) and suggested_hashtags for the trend research.
        Candidates are extracted from ranked list pages; the agent confirms or replaces them with its own
        market knowledge. No metric is ever invented.
    """
    try:
        name = (company or "").strip()
        niche = (industry or "").strip()
        if not niche:
            return _error("industry is required to find competitors.")
        market = f" {region.strip()}" if region and region.strip() else ""
        queries = [f"top {niche} brands{market} list"]
        if name:
            queries.append(f"{name} competitors{market}")
        else:
            queries.append(f"best {niche} companies{market}")

        evidence: list[dict] = []
        list_pages: list[str] = []
        industry_words = {w.lower() for w in re.findall(r"[A-Za-z]+", niche)}
        with ThreadPoolExecutor(max_workers=len(queries)) as pool:
            found = list(pool.map(lambda query: _search(query, 6), queries))
        for query, (results, provider) in zip(queries, found):
            evidence.append({"query": query, "provider": provider, "results": results})
            for result in results:
                url = result.get("url") or ""
                if url and not _is_directory(url) and url not in list_pages:
                    list_pages.append(url)

        # Read the two highest-ranked list pages: the model judges brands from the text, the headings are a hint.
        targets = list_pages[:2]
        titles = {item.get("url") or "": item.get("title") or "" for group in evidence for item in group["results"]}
        excerpts: list[dict] = []
        mentions: dict[str, int] = {}

        def read(url: str) -> tuple[str, str]:
            return url, _http(url, timeout=SEARCH_TIMEOUT_SECONDS) or ""

        with ThreadPoolExecutor(max_workers=max(1, len(targets))) as pool:
            pages = list(pool.map(read, targets))
        for url, body in pages:
            text = _visible_text(body)
            excerpts.append({"url": url, "title": titles.get(url, ""), "text": text})
            for candidate in _candidates_from_body(body, industry_words):
                if candidate.lower() == name.lower():
                    continue
                if text.count(candidate) < 2:  # a one-off table header or menu item is not a brand
                    continue
                mentions[candidate] = mentions.get(candidate, 0) + 1
        candidates = [c for c, _n in sorted(mentions.items(), key=lambda item: item[1], reverse=True)]

        hashtag_base = re.sub(r"[^a-z0-9]", "", niche.lower()) or "contentmarketing"
        return {
            "status": "success" if evidence else "empty",
            "company": name,
            "industry": niche,
            "region": region or "global",
            "suggested_competitors": candidates[: max(8, max_competitors * 2)],
            "evidence": evidence,
            "list_page_excerpts": excerpts,
            "suggested_searches": [
                f"{niche} tips",
                f"{niche} mistakes",
                f"how to choose {niche}",
                f"{niche} before after",
            ],
            "suggested_hashtags": [f"#{hashtag_base}", f"#{hashtag_base}tips", f"#{hashtag_base}life"],
            "note": (
                "Read list_page_excerpts and combine them with your own market knowledge to name 3-5 brands "
                "that genuinely compete for the same buyer. Treat suggested_competitors as a hint only, and "
                "state in one line why each chosen competitor qualifies."
            ),
        }
    except (SearchError, TypeError, ValueError) as exc:
        return _error(str(exc))


def _social_links(body: str) -> dict:
    """Extract official social profiles from a page's HTML.

    Args:
        body: The page HTML.

    Returns:
        dict with instagram, youtube and facebook lists of handles or channel paths.
    """
    instagram, youtube, facebook = [], [], []
    for handle in _INSTAGRAM.findall(body or ""):
        if handle.lower() not in _RESERVED and handle not in instagram:
            instagram.append(handle)
    for path in _YOUTUBE.findall(body or ""):
        if path not in youtube:
            youtube.append(path)
    for page in _FACEBOOK.findall(body or ""):
        if page.lower() not in _RESERVED and page not in facebook:
            facebook.append(page)
    return {"instagram": instagram, "youtube": youtube, "facebook": facebook}


def _brand_domains(slug: str) -> list[str]:
    """Candidate official domains for a brand slug."""
    return [f"https://{slug}.com", f"https://www.{slug}.com", f"https://{slug}.co"]


def find_brand_profiles(brands: str, platforms: str = "instagram,youtube,facebook") -> dict:
    """Resolve the official social profiles of a list of brands.

    The brand's own website is the primary source (it links its real profiles). Search results and a
    name-based guess are used only as fallbacks, and every handle carries its confidence.

    Args:
        brands: Brand names, comma separated (max 8).
        platforms: Which profiles to resolve, comma separated: 'instagram', 'youtube', 'facebook'.

    Returns:
        dict with status and profiles: per brand the website, instagram/youtube/facebook handles and
        'confidence' ('verified' from the brand site, 'search' from search results, 'guess' otherwise).
    """
    try:
        names = [n for n in (b.strip() for b in (brands or "").split(",")) if n][:8]
        if not names:
            return _error("Give at least one brand name.")
        wanted = {p.strip().lower() for p in (platforms or "instagram,youtube,facebook").split(",") if p.strip()}
        out: dict[str, dict] = {}
        for brand in names:
            slug = re.sub(r"[^a-z0-9]", "", brand.lower())
            entry: dict[str, Any] = {
                "website": None, "instagram": [], "youtube": [], "facebook": [],
                "confidence": "guess", "sources": [],
            }
            for domain in _brand_domains(slug):
                body = _http(domain, timeout=15)
                if not body:
                    continue
                # A guessed domain may belong to someone else: it must name the brand to be accepted.
                fingerprint = re.sub(r"[^a-z0-9]", "", _visible_text(body, 4000).lower())
                if slug and slug not in fingerprint:
                    continue
                links = _social_links(body)
                if not any(links.values()):
                    links = _social_links(_http(domain.rstrip("/") + "/contact", timeout=15) or "")
                entry.update({key: links[key] for key in ("instagram", "youtube", "facebook") if links[key]})
                entry["website"] = domain
                entry["confidence"] = "verified"
                entry["sources"].append(domain)
                break

            if not entry["instagram"] and not entry["facebook"]:
                results, _provider = _search(f"{brand} official instagram facebook", 6)
                for result in results:
                    url = result.get("url") or ""
                    entry["sources"].append(url)
                    for handle in _INSTAGRAM.findall(url):
                        if handle.lower() not in _RESERVED and handle not in entry["instagram"]:
                            entry["instagram"].append(handle)
                    for page in _FACEBOOK.findall(url):
                        if page.lower() not in _RESERVED and page not in entry["facebook"]:
                            entry["facebook"].append(page)
                    for path in _YOUTUBE.findall(url):
                        if path not in entry["youtube"]:
                            entry["youtube"].append(path)
                if entry["instagram"] or entry["facebook"] or entry["youtube"]:
                    entry["confidence"] = "search"

            if not entry["instagram"] and slug:
                entry["instagram"] = [slug]
            if not entry["facebook"] and slug:
                entry["facebook"] = [slug]
            if wanted and "youtube" not in wanted:
                entry.pop("youtube", None)
            out[brand] = entry
        return {
            "status": "success",
            "profiles": out,
            "note": "confidence 'verified' means the handle was read from the brand's own website; 'guess' is a "
                    "name-based fallback - the harvest reports which handles returned posts.",
        }
    except (SearchError, TypeError, ValueError) as exc:
        return _error(str(exc))
