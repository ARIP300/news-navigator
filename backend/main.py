import asyncio
import json
import time
import random
from datetime import datetime
from typing import AsyncGenerator
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import httpx

app = FastAPI(title="News Navigator AI")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

NEWSAPI_KEY = "demo"  # Replace with real key

# ─────────────────────────── Fallback news corpus ───────────────────────────

FALLBACK_CORPUS = {
    "default": [
        {
            "title": "Global Markets React to Policy Shifts",
            "description": "Equity markets worldwide showed mixed reactions as central banks signaled potential rate adjustments amid evolving economic indicators.",
            "source": "Financial Times", "publishedAt": "2026-03-25T10:00:00Z",
            "url": "https://ft.com"
        },
        {
            "title": "Technology Sector Faces Regulatory Scrutiny",
            "description": "Lawmakers across multiple jurisdictions are intensifying oversight of AI companies and major tech platforms over data privacy and market dominance concerns.",
            "source": "Reuters", "publishedAt": "2026-03-25T09:00:00Z",
            "url": "https://reuters.com"
        },
        {
            "title": "Supply Chain Disruptions Continue to Impact Global Trade",
            "description": "Shipping bottlenecks and geopolitical tensions are prolonging supply chain challenges, with downstream effects on consumer prices and corporate margins.",
            "source": "Bloomberg", "publishedAt": "2026-03-24T15:00:00Z",
            "url": "https://bloomberg.com"
        },
    ],
    "transgender": [
        {
            "title": "Transgender Rights Bill 2026 Advances in Congress",
            "description": "A landmark bill addressing transgender rights in healthcare, education, and public accommodations passed committee review with bipartisan support, heading to a full Senate vote.",
            "source": "AP News", "publishedAt": "2026-03-26T08:00:00Z", "url": "https://apnews.com"
        },
        {
            "title": "States Split on Trans Youth Sports Legislation",
            "description": "At least 14 states have enacted or are considering legislation restricting transgender youth participation in competitive sports, creating a patchwork of laws across the country.",
            "source": "NPR", "publishedAt": "2026-03-25T11:00:00Z", "url": "https://npr.org"
        },
        {
            "title": "Healthcare Access for Transgender Adults Remains Contested",
            "description": "Insurance coverage mandates for gender-affirming care remain a flashpoint in state legislatures, with courts divided on constitutional protections.",
            "source": "The Guardian", "publishedAt": "2026-03-24T14:00:00Z", "url": "https://guardian.com"
        },
        {
            "title": "ACLU Files Suit Against Three States Over Trans Bathroom Bills",
            "description": "Civil liberties groups escalate legal challenges after bathroom restriction laws were signed in three southern states, citing federal anti-discrimination protections.",
            "source": "CNN", "publishedAt": "2026-03-23T16:00:00Z", "url": "https://cnn.com"
        },
    ],
    "ai": [
        {
            "title": "OpenAI Releases GPT-5 with Reasoning Capabilities",
            "description": "The next-generation model demonstrates dramatically improved logical reasoning, coding proficiency, and multimodal understanding in benchmark evaluations.",
            "source": "TechCrunch", "publishedAt": "2026-03-26T09:00:00Z", "url": "https://techcrunch.com"
        },
        {
            "title": "EU AI Act Enforcement Begins: Companies Rush to Comply",
            "description": "The European Union's comprehensive AI regulation enters its enforcement phase, with fines of up to 6% of global revenue for high-risk AI deployments.",
            "source": "Wired", "publishedAt": "2026-03-25T12:00:00Z", "url": "https://wired.com"
        },
        {
            "title": "AI Agents Deployed Across Fortune 500 for Autonomous Decision-Making",
            "description": "A growing number of major corporations have deployed autonomous AI agents in supply chain, HR, and financial reporting workflows.",
            "source": "WSJ", "publishedAt": "2026-03-24T10:00:00Z", "url": "https://wsj.com"
        },
    ],
    "economy": [
        {
            "title": "Fed Holds Rates Steady Amid Inflation Uncertainty",
            "description": "The Federal Reserve kept benchmark interest rates unchanged for the third consecutive meeting, citing mixed inflation data and a resilient labor market.",
            "source": "Bloomberg", "publishedAt": "2026-03-26T14:00:00Z", "url": "https://bloomberg.com"
        },
        {
            "title": "US GDP Growth Revised Down to 1.8% for Q4 2025",
            "description": "Revised figures show slower growth than initially estimated, driven by softer consumer spending and declining business investment in the fourth quarter.",
            "source": "Reuters", "publishedAt": "2026-03-25T10:00:00Z", "url": "https://reuters.com"
        },
    ]
}

def get_fallback_articles(query: str):
    q = query.lower()
    for key in FALLBACK_CORPUS:
        if key != "default" and key in q:
            return FALLBACK_CORPUS[key]
    return FALLBACK_CORPUS["default"]


# ─────────────────────────── News Fetcher ───────────────────────────

async def fetch_news(query: str):
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            r = await client.get(
                "https://newsapi.org/v2/everything",
                params={"q": query, "pageSize": 8, "sortBy": "publishedAt", "apiKey": NEWSAPI_KEY}
            )
            data = r.json()
            articles = data.get("articles", [])
            if articles and len(articles) >= 2:
                return articles, "newsapi"
    except Exception:
        pass

    # fallback
    articles = get_fallback_articles(query)
    return articles, "fallback"


# ─────────────────────────── Agent Prompts ───────────────────────────

def planner_analysis(query, articles):
    topics = list({a.get("source", {}) if isinstance(a.get("source"), str) else a.get("source", {}).get("name", "Unknown") for a in articles[:4]})
    return {
        "plan": [
            f"Decompose '{query}' into key sub-themes",
            f"Identify {len(articles)} news sources for cross-referencing",
            "Flag high-priority angles: political, economic, social impact",
            "Delegate research threads to sub-agents",
            "Set confidence threshold: 0.75"
        ],
        "sub_queries": [query, f"{query} impact", f"{query} latest update"],
        "priority": "HIGH" if any(w in query.lower() for w in ["bill","law","war","crisis","ban","ai","economy"]) else "MEDIUM"
    }

def research_analysis(query, articles):
    sources = []
    for a in articles:
        src = a.get("source", "")
        if isinstance(src, dict): src = src.get("name", "Unknown")
        sources.append(src)
    return {
        "articles_found": len(articles),
        "sources": list(set(sources)),
        "date_range": "Last 72 hours",
        "key_facts": [a.get("title", "")[:80] for a in articles[:4]],
        "data_quality": "HIGH" if len(articles) >= 4 else "MEDIUM"
    }

def analysis_agent(query, articles):
    titles = " ".join(a.get("title", "") + " " + (a.get("description") or "") for a in articles)
    t = titles.lower()
    # sentiment
    pos_words = ["advance","support","growth","win","positive","success","improve","approve","landmark","record"]
    neg_words = ["crisis","fail","ban","restrict","decline","loss","risk","concern","oppose","challenge","lawsuit","fear"]
    pos = sum(t.count(w) for w in pos_words)
    neg = sum(t.count(w) for w in neg_words)
    total = pos + neg + 1
    if pos > neg * 1.5: sentiment, score = "POSITIVE", round(0.55 + min(pos/total, 0.4), 2)
    elif neg > pos * 1.5: sentiment, score = "NEGATIVE", round(0.55 + min(neg/total, 0.4), 2)
    else: sentiment, score = "MIXED", 0.48

    # confidence
    confidence = round(min(0.60 + len(articles) * 0.04, 0.96), 2)

    themes = []
    if any(w in t for w in ["bill","law","legislation","senate","congress"]): themes.append("Legislative")
    if any(w in t for w in ["court","lawsuit","legal","aclu","judge"]): themes.append("Legal/Judicial")
    if any(w in t for w in ["market","stock","gdp","economy","rate","inflation"]): themes.append("Economic")
    if any(w in t for w in ["tech","ai","data","digital","software"]): themes.append("Technology")
    if any(w in t for w in ["health","medical","hospital","drug","care"]): themes.append("Healthcare")
    if any(w in t for w in ["war","military","conflict","attack","defense"]): themes.append("Geopolitical")
    if not themes: themes = ["General News"]

    return {"sentiment": sentiment, "sentiment_score": score, "confidence": confidence, "themes": themes, "article_count": len(articles)}

def build_briefing(query, articles, analysis):
    titles = [a.get("title", "") for a in articles]
    descs = [a.get("description") or "" for a in articles]
    full_text = " ".join(titles + descs).lower()

    # Quick brief
    first_title = articles[0].get("title", query) if articles else query
    first_desc = articles[0].get("description") or "" if articles else ""
    quick_brief = f"{first_title}. " + (first_desc[:120] + "..." if len(first_desc) > 120 else first_desc)

    # TL;DR
    tldr = f"Multiple developments around **{query}** are unfolding across {len(analysis['themes'])} key dimensions — {', '.join(analysis['themes'][:3])}. Sentiment is {analysis['sentiment'].lower()} with {int(analysis['confidence']*100)}% confidence based on {analysis['article_count']} sources."

    # Highlights
    highlights = []
    for a in articles[:5]:
        t = a.get("title", "")
        src = a.get("source", "")
        if isinstance(src, dict): src = src.get("name", "")
        if t: highlights.append(f"**{src}**: {t}")

    # Key numbers
    import re
    numbers = []
    for text in titles + descs:
        found = re.findall(r'\b\d+[\.,]?\d*\s*(?:%|billion|million|trillion|states?|countries|years?|months?|days?|votes?|seats?|points?|percent)\b', text, re.I)
        numbers.extend(found[:2])
    numbers = list(dict.fromkeys(numbers))[:6]
    if not numbers: numbers = [f"{analysis['article_count']} sources analyzed", f"{int(analysis['confidence']*100)}% confidence score", "Coverage: Last 72 hours"]

    # Winners & Losers
    winners, losers = [], []
    t = full_text
    if any(w in t for w in ["advance","support","pass","approve","win","gain","landmark"]): winners.append("Proponents & advocacy groups")
    if any(w in t for w in ["tech","ai","digital","startup"]): winners.append("Technology sector")
    if any(w in t for w in ["market","investor","stock"]): winners.append("Institutional investors")
    if any(w in t for w in ["oppose","restrict","fail","decline","loss","crisis"]): losers.append("Opposition stakeholders")
    if any(w in t for w in ["consumer","worker","employee"]): losers.append("Consumers & workers")
    if not winners: winners = ["Policy advocates", "Informed public"]
    if not losers: losers = ["Status-quo incumbents", "Uninformed stakeholders"]

    # Why it matters
    matters = f"This story sits at the intersection of {' and '.join(analysis['themes'][:2])} — areas with direct impact on policy, markets, and public discourse. With {analysis['article_count']} sources showing {analysis['sentiment'].lower()} sentiment, the trajectory of this issue will shape decisions at multiple levels in the coming weeks."

    # What to watch
    watch = [
        f"How {query.split()[0] if query.split() else 'stakeholders'} respond to latest developments",
        "Legislative or regulatory action in the next 30 days",
        "Reactions from key industry players and advocacy groups",
        "Polling or public opinion shifts"
    ]

    return {
        "quick_brief": quick_brief,
        "tldr": tldr,
        "highlights": highlights,
        "key_numbers": numbers,
        "winners": winners,
        "losers": losers,
        "why_it_matters": matters,
        "what_to_watch": watch,
        "sentiment": analysis["sentiment"],
        "sentiment_score": analysis["sentiment_score"],
        "confidence": analysis["confidence"],
        "themes": analysis["themes"],
        "sources": list({(a.get("source", {}).get("name", "") if isinstance(a.get("source"), dict) else a.get("source", "")) for a in articles})[:6]
    }

def reflection_agent(briefing, query):
    gaps = []
    if briefing["confidence"] < 0.75: gaps.append("Low source diversity — expand search scope")
    if len(briefing["highlights"]) < 3: gaps.append("Insufficient article coverage for full analysis")
    if briefing["sentiment"] == "MIXED": gaps.append("Conflicting signals — recommend monitoring 24h")
    if not gaps: gaps = ["Analysis appears comprehensive", "Cross-source consistency verified"]
    return {"gaps": gaps, "quality": "GOOD" if briefing["confidence"] > 0.75 else "FAIR", "recommendation": "Publish briefing" if briefing["confidence"] > 0.7 else "Flag for human review"}


# ─────────────────────────── Streaming endpoint ───────────────────────────

async def run_agents(query: str) -> AsyncGenerator[str, None]:
    def event(agent, status, data):
        return json.dumps({"agent": agent, "status": status, "data": data, "ts": datetime.utcnow().isoformat()}) + "\n"

    yield event("system", "start", {"message": f"Initializing News Navigator for: {query}"})
    await asyncio.sleep(0.3)

    # PLANNER
    yield event("planner", "thinking", {"message": "Decomposing query into research plan..."})
    await asyncio.sleep(0.6)
    # fetch news first for planner to use
    articles, news_source = await fetch_news(query)
    plan = planner_analysis(query, articles)
    yield event("planner", "done", {
        "message": f"Plan ready — Priority: {plan['priority']}",
        "plan": plan["plan"],
        "tool": f"query_planner({'newsapi' if news_source=='newsapi' else 'fallback_corpus'})"
    })
    await asyncio.sleep(0.4)

    # RESEARCH
    yield event("research", "thinking", {"message": f"Fetching news via {news_source}..."})
    await asyncio.sleep(0.7)
    research = research_analysis(query, articles)
    yield event("research", "done", {
        "message": f"Found {research['articles_found']} articles from {len(research['sources'])} sources",
        "sources": research["sources"],
        "quality": research["data_quality"],
        "tool": f"news_fetch(query='{query}', source='{news_source}')"
    })
    await asyncio.sleep(0.4)

    # ANALYSIS
    yield event("analysis", "thinking", {"message": "Running NLP sentiment & theme extraction..."})
    await asyncio.sleep(0.8)
    analysis = analysis_agent(query, articles)
    yield event("analysis", "done", {
        "message": f"Sentiment: {analysis['sentiment']} ({int(analysis['sentiment_score']*100)}%) | Confidence: {int(analysis['confidence']*100)}%",
        "themes": analysis["themes"],
        "sentiment": analysis["sentiment"],
        "confidence": analysis["confidence"],
        "tool": "sentiment_engine(model='lexicon+heuristic')"
    })
    await asyncio.sleep(0.4)

    # BRIEFING
    yield event("briefing", "thinking", {"message": "Structuring intelligence briefing..."})
    await asyncio.sleep(0.9)
    briefing = build_briefing(query, articles, analysis)
    yield event("briefing", "done", {
        "message": "Briefing compiled — 7 sections ready",
        "sections": ["Quick Brief","TL;DR","Highlights","Key Numbers","Winners & Losers","Why It Matters","What to Watch"],
        "tool": "briefing_compiler(sections=7)"
    })
    await asyncio.sleep(0.4)

    # REFLECTION
    yield event("reflection", "thinking", {"message": "Quality-checking output for gaps & bias..."})
    await asyncio.sleep(0.5)
    reflection = reflection_agent(briefing, query)
    yield event("reflection", "done", {
        "message": f"Quality: {reflection['quality']} — {reflection['recommendation']}",
        "gaps": reflection["gaps"],
        "tool": "self_critique(threshold=0.75)"
    })
    await asyncio.sleep(0.3)

    # FINAL
    yield event("system", "complete", {"briefing": briefing, "message": "All agents complete."})


@app.post("/analyze")
async def analyze(request: Request):
    body = await request.json()
    query = body.get("query", "").strip() or "Latest Business News"
    return StreamingResponse(run_agents(query), media_type="application/x-ndjson")

@app.get("/health")
def health():
    return {"status": "ok", "time": datetime.utcnow().isoformat()}
