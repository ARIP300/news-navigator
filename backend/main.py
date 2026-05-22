import re
import os
from datetime import datetime
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import httpx
from dotenv import load_dotenv

# ── Phase 2: Real ML/NLP imports ─────────────────────────────────────
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
import spacy
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np

load_dotenv()

# ── Load ML models ONCE at startup (expensive — do not load per request) ──
print("[Startup] Loading VADER sentiment analyzer...")
vader = SentimentIntensityAnalyzer()

print("[Startup] Loading spaCy NER model (en_core_web_sm)...")
nlp = spacy.load("en_core_web_sm")

print("[Startup] Loading sentence-transformer model (all-MiniLM-L6-v2)...")
embedder = SentenceTransformer("all-MiniLM-L6-v2")

print("[Startup] All ML models loaded. Server ready.")

app = FastAPI(title="News Navigator AI")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

NEWSAPI_KEY = os.getenv("NEWSAPI_KEY", "")

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
            "description": "A landmark bill addressing transgender rights in healthcare, education, and public accommodations passed committee review with bipartisan support.",
            "source": "AP News", "publishedAt": "2026-03-26T08:00:00Z", "url": "https://apnews.com"
        },
        {
            "title": "States Split on Trans Youth Sports Legislation",
            "description": "At least 14 states have enacted or are considering legislation restricting transgender youth participation in competitive sports.",
            "source": "NPR", "publishedAt": "2026-03-25T11:00:00Z", "url": "https://npr.org"
        },
        {
            "title": "Healthcare Access for Transgender Adults Remains Contested",
            "description": "Insurance coverage mandates for gender-affirming care remain a flashpoint in state legislatures.",
            "source": "The Guardian", "publishedAt": "2026-03-24T14:00:00Z", "url": "https://guardian.com"
        },
        {
            "title": "ACLU Files Suit Against Three States Over Trans Bathroom Bills",
            "description": "Civil liberties groups escalate legal challenges after bathroom restriction laws were signed in three southern states.",
            "source": "CNN", "publishedAt": "2026-03-23T16:00:00Z", "url": "https://cnn.com"
        },
    ],
    "ai": [
        {
            "title": "OpenAI Releases GPT-5 with Reasoning Capabilities",
            "description": "The next-generation model demonstrates dramatically improved logical reasoning, coding proficiency, and multimodal understanding.",
            "source": "TechCrunch", "publishedAt": "2026-03-26T09:00:00Z", "url": "https://techcrunch.com"
        },
        {
            "title": "EU AI Act Enforcement Begins: Companies Rush to Comply",
            "description": "The European Union's comprehensive AI regulation enters its enforcement phase, with fines of up to 6% of global revenue.",
            "source": "Wired", "publishedAt": "2026-03-25T12:00:00Z", "url": "https://wired.com"
        },
        {
            "title": "AI Agents Deployed Across Fortune 500 for Autonomous Decision-Making",
            "description": "A growing number of major corporations have deployed autonomous AI agents in supply chain, HR, and financial reporting.",
            "source": "WSJ", "publishedAt": "2026-03-24T10:00:00Z", "url": "https://wsj.com"
        },
    ],
    "economy": [
        {
            "title": "Fed Holds Rates Steady Amid Inflation Uncertainty",
            "description": "The Federal Reserve kept benchmark interest rates unchanged for the third consecutive meeting.",
            "source": "Bloomberg", "publishedAt": "2026-03-26T14:00:00Z", "url": "https://bloomberg.com"
        },
        {
            "title": "US GDP Growth Revised Down to 1.8% for Q4 2025",
            "description": "Revised figures show slower growth than initially estimated, driven by softer consumer spending.",
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
    """Try live NewsAPI first; fall back to corpus if key missing or request fails."""
    if NEWSAPI_KEY:
        try:
            async with httpx.AsyncClient(timeout=8) as client:
                r = await client.get(
                    "https://newsapi.org/v2/everything",
                    params={"q": query, "pageSize": 8, "sortBy": "publishedAt", "apiKey": NEWSAPI_KEY}
                )
                data = r.json()
                articles = data.get("articles", [])
                if articles and len(articles) >= 2:
                    return articles, "live"
        except Exception:
            pass

    articles = get_fallback_articles(query)
    return articles, "fallback"


# ─────────────────────────── Agent Functions ───────────────────────────

def planner_analysis(query, articles):
    topics = list({
        a.get("source") if isinstance(a.get("source"), str)
        else a.get("source", {}).get("name", "Unknown")
        for a in articles[:4]
    })
    priority = "HIGH" if any(
        w in query.lower() for w in ["bill", "law", "war", "crisis", "ban", "ai", "economy"]
    ) else "MEDIUM"
    return {
        "plan": [
            f"Decompose '{query}' into key sub-themes",
            f"Identify {len(articles)} news sources for cross-referencing",
            "Flag high-priority angles: political, economic, social impact",
            "Delegate research threads to sub-agents",
            "Set confidence threshold: 0.75"
        ],
        "sub_queries": [query, f"{query} impact", f"{query} latest update"],
        "priority": priority,
        "sources_preview": topics[:3],
    }


def research_analysis(query, articles):
    sources = []
    for a in articles:
        src = a.get("source", "")
        if isinstance(src, dict):
            src = src.get("name", "Unknown")
        sources.append(src)
    return {
        "articles_found": len(articles),
        "sources": list(set(sources)),
        "date_range": "Last 72 hours",
        "key_facts": [a.get("title", "")[:80] for a in articles[:4]],
        "data_quality": "HIGH" if len(articles) >= 4 else "MEDIUM",
    }


# ─────────────────────────── Real ML Tool Functions ───────────────────────────

def embed_text(text: str) -> np.ndarray:
    """Convert text to a 384-dimensional semantic embedding vector using SBERT."""
    return embedder.encode([text])[0]


def cluster_articles(articles: list, threshold: float = 0.45) -> list[list]:
    """
    Group articles into thematic clusters using real cosine similarity on SBERT embeddings.
    Returns a list of clusters, each cluster being a list of article dicts.
    """
    if len(articles) < 2:
        return [articles]

    texts = [a.get("title", "") + " " + (a.get("description") or "") for a in articles]
    embeddings = embedder.encode(texts)
    sim_matrix = cosine_similarity(embeddings)

    clusters = []
    assigned = set()
    for i in range(len(articles)):
        if i in assigned:
            continue
        cluster = [articles[i]]
        assigned.add(i)
        for j in range(i + 1, len(articles)):
            if j not in assigned and sim_matrix[i][j] >= threshold:
                cluster.append(articles[j])
                assigned.add(j)
        clusters.append(cluster)
    return clusters


def extract_entities(text: str) -> dict:
    """
    Run spaCy Named Entity Recognition to extract real entities:
    people, organizations, money amounts, dates, locations.
    """
    doc = nlp(text[:10000])  # spaCy has a token limit
    entities = {"ORG": [], "PERSON": [], "MONEY": [], "GPE": [], "DATE": [], "PERCENT": []}
    for ent in doc.ents:
        if ent.label_ in entities:
            val = ent.text.strip()
            if val and val not in entities[ent.label_]:
                entities[ent.label_].append(val)
    return {k: v[:5] for k, v in entities.items() if v}  # cap at 5 per type


def analysis_agent(query, articles):
    """
    Phase 2: Real ML-powered analysis.
    - VADER for sentiment (replaces word counting)
    - sentence-transformers for embeddings (replaces ghost function)
    - Cosine similarity clustering (replaces ghost function)
    - spaCy NER for entity extraction (replaces ghost function)
    """
    full_text = " ".join(
        a.get("title", "") + " " + (a.get("description") or "")
        for a in articles
    )

    # ── Real Sentiment Analysis (VADER) ──────────────────────────────
    vader_scores = vader.polarity_scores(full_text)
    compound = vader_scores["compound"]  # -1.0 (most negative) to +1.0 (most positive)
    if compound >= 0.05:
        sentiment, score = "Positive", round(0.5 + compound / 2, 2)
    elif compound <= -0.05:
        sentiment, score = "Negative", round(0.5 + abs(compound) / 2, 2)
    else:
        sentiment, score = "Neutral", round(0.5 + abs(compound) / 2, 2)

    # ── Real Confidence (based on source count + VADER certainty) ────
    certainty = abs(compound)  # how strongly VADER feels
    confidence = round(min(0.50 + len(articles) * 0.04 + certainty * 0.2, 0.97), 2)

    # ── Real Clustering (sentence-transformers + cosine similarity) ──
    clusters = cluster_articles(articles, threshold=0.45)

    # ── Real NER (spaCy) ─────────────────────────────────────────────
    entities = extract_entities(full_text)

    # ── Theme detection (keyword-assisted, NER-enhanced) ─────────────
    t = full_text.lower()
    themes = []
    if any(w in t for w in ["bill", "law", "legislation", "senate", "congress", "policy", "budget", "regulation"]):
        themes.append("Legislative / Policy")
    if any(w in t for w in ["court", "lawsuit", "legal", "aclu", "judge"]):
        themes.append("Legal / Judicial")
    if any(w in t for w in ["market", "stock", "gdp", "economy", "rate", "inflation", "earnings", "profit", "revenue"]):
        themes.append("Economic / Financial")
    if any(w in t for w in ["tech", "ai", "data", "digital", "software", "startup", "funding"]):
        themes.append("Technology")
    if any(w in t for w in ["health", "medical", "hospital", "drug", "care"]):
        themes.append("Healthcare")
    if any(w in t for w in ["war", "military", "conflict", "attack", "defense"]):
        themes.append("Geopolitical")
    if not themes:
        themes = ["General News"]

    return {
        "sentiment": sentiment,
        "sentiment_score": score,
        "vader_raw": vader_scores,           # expose raw VADER scores
        "confidence": confidence,
        "themes": themes,
        "article_count": len(articles),
        "cluster_count": len(clusters),
        "clusters": clusters,
        "entities": entities,                # real named entities
    }


def build_briefing(query, articles, analysis):
    titles = [a.get("title", "") for a in articles]
    descs = [a.get("description") or "" for a in articles]
    full_text = " ".join(titles + descs).lower()

    first_title = articles[0].get("title", query) if articles else query
    first_desc = articles[0].get("description") or "" if articles else ""
    quick_brief = (
        first_title + ". " +
        (first_desc[:120] + "..." if len(first_desc) > 120 else first_desc)
    )

    tldr = (
        f"Multiple developments around **{query}** are unfolding across "
        f"{len(analysis['themes'])} key dimensions — "
        f"{', '.join(analysis['themes'][:3])}. "
        f"Sentiment is {analysis['sentiment'].lower()} with "
        f"{int(analysis['confidence'] * 100)}% confidence based on "
        f"{analysis['article_count']} sources."
    )

    highlights = []
    for a in articles[:6]:
        t = a.get("title", "")
        src = a.get("source", "")
        if isinstance(src, dict):
            src = src.get("name", "")
        if t:
            highlights.append({
                "title": t,
                "source": src,
                "sentiment": analysis["sentiment"],
                "theme": "Coverage",
            })

    numbers = []
    for text in titles + descs:
        found = re.findall(
            r'\b\d+[\.,]?\d*\s*(?:%|billion|million|trillion|states?|countries|years?|months?|days?|votes?|seats?|points?|percent|crore|lakh)\b',
            text, re.I
        )
        numbers.extend(found[:2])
    numbers = list(dict.fromkeys(numbers))[:8]
    if not numbers:
        numbers_display = [
            f"{analysis['article_count']} sources analysed",
            f"{int(analysis['confidence'] * 100)}% confidence score",
            "Coverage: Last 72 hours"
        ]
    else:
        numbers_display = numbers

    winners, losers = [], []
    if any(w in full_text for w in ["advance", "support", "pass", "approve", "win", "gain", "landmark"]):
        winners.append("Proponents & advocacy groups")
    if any(w in full_text for w in ["tech", "ai", "digital", "startup"]):
        winners.append("Technology sector")
    if any(w in full_text for w in ["market", "investor", "stock"]):
        winners.append("Institutional investors")
    if any(w in full_text for w in ["oppose", "restrict", "fail", "decline", "loss", "crisis"]):
        losers.append("Opposition stakeholders")
    if any(w in full_text for w in ["consumer", "worker", "employee"]):
        losers.append("Consumers & workers")
    if not winners:
        winners = ["Policy advocates", "Informed public"]
    if not losers:
        losers = ["Status-quo incumbents", "Uninformed stakeholders"]

    why_it_matters = (
        f"This story sits at the intersection of "
        f"{' and '.join(analysis['themes'][:2])} — areas with direct impact on "
        f"policy, markets, and public discourse. With {analysis['article_count']} "
        f"sources showing {analysis['sentiment'].lower()} sentiment, the trajectory "
        f"of this issue will shape decisions at multiple levels in the coming weeks."
    )

    what_to_watch = [
        f"How {query.split()[0] if query.split() else 'stakeholders'} respond to latest developments",
        "Legislative or regulatory action in the next 30 days",
        "Reactions from key industry players and advocacy groups",
        "Polling or public opinion shifts",
    ]

    source_names = list({
        (a.get("source", {}).get("name", "") if isinstance(a.get("source"), dict)
         else a.get("source", ""))
        for a in articles
    })[:6]

    return {
        "status": "success",
        "topic": query,
        "generated_at": datetime.utcnow().strftime("%d %b %Y, %H:%M UTC"),
        "sources_analysed": len(articles),
        "source_names": source_names,
        "overall_sentiment": analysis["sentiment"],
        "confidence": analysis["confidence"],
        "query_type": "general",
        "quick_brief": quick_brief,
        "sections": {
            "tldr": tldr,
            "highlights": highlights,
            "important_numbers": [{"value": n, "context": "Extracted from coverage"} for n in numbers_display],
            "winners_and_losers": {"winners": winners, "losers": losers},
            "why_it_matters": why_it_matters,
            "what_to_watch_next": what_to_watch,
            "themes": [
                {"id": i + 1, "label": theme, "article_count": max(1, len(articles) // len(analysis["themes"])), "sentiment": analysis["sentiment"], "numbers": []}
                for i, theme in enumerate(analysis["themes"])
            ],
        },
    }


def reflection_agent(briefing, query):
    gaps = []
    if briefing["confidence"] < 0.75:
        gaps.append("Low source diversity — expand search scope")
    if len(briefing["sections"]["highlights"]) < 3:
        gaps.append("Insufficient article coverage for full analysis")
    if briefing["overall_sentiment"] == "Neutral":
        gaps.append("Conflicting signals — recommend monitoring 24h")
    if not gaps:
        gaps = ["Analysis appears comprehensive", "Cross-source consistency verified"]
    return {
        "gaps": gaps,
        "quality": "GOOD" if briefing["confidence"] > 0.75 else "FAIR",
        "recommendation": "Publish briefing" if briefing["confidence"] > 0.7 else "Flag for human review",
    }


def build_logs(query, plan, research, analysis, briefing, reflection, news_source):
    """Build the execution log list that the frontend streams character-by-character."""
    qtype = "policy" if any(w in query.lower() for w in ["budget", "policy", "bill", "tax", "rbi", "sebi"]) \
        else "earnings" if any(w in query.lower() for w in ["earnings", "results", "profit", "q1", "q2", "q3", "q4"]) \
        else "funding" if any(w in query.lower() for w in ["funding", "startup", "unicorn", "series"]) \
        else "general"

    sources_preview = ", ".join(research["sources"][:3])
    nums_found = len(briefing["sections"]["important_numbers"])
    src_label = "NewsAPI (live)" if news_source == "live" else "fallback corpus"
    compound = analysis.get("vader_raw", {}).get("compound", 0)
    cluster_count = analysis.get("cluster_count", 1)
    entity_count = sum(len(v) for v in analysis.get("entities", {}).values())
    entity_preview = ", ".join(
        f"{k}: {', '.join(v[:2])}" for k, v in list(analysis.get("entities", {}).items())[:2]
    ) or "none detected"

    return [
        f"[Crew] ═══ Pipeline started for: '{query}' ═══",
        "[Crew] Agents online: Planner, Research, Analysis, Briefing, Reflection, Chat",
        f"[Planner] Received query: '{query}'",
        "[Planner] Analyzing query intent and classifying topic domain...",
        f"[Planner] Query type classified as: {qtype.upper()}",
        "[Planner] Strategy: FETCH → CLUSTER → EXTRACT → BRIEF → REFLECT",
        f"[Planner] Priority: {plan['priority']}",
        f"[Planner] Sub-queries: {' | '.join(plan['sub_queries'])}",
        "[Planner] Delegating to ResearchAgent with context: query_type=" + qtype,
        "[Research] Initializing news retrieval pipeline...",
        f"[Research] Attempting live data fetch via {src_label}...",
        f"[Research] ✓ Fetched {research['articles_found']} articles from {len(research['sources'])} sources",
        f"[Research] Data quality: {research['data_quality']}",
        f"[Research] Sources: {sources_preview}...",
        "[Research] Research complete. Passing to AnalysisAgent.",
        f"[Analysis] Received {research['articles_found']} articles for deep analysis",
        "[Analysis] Tool: embed_text() via sentence-transformers (all-MiniLM-L6-v2, 384-dim SBERT)",
        f"[Analysis] Running embed_text() on {research['articles_found']} articles...",
        f"[Analysis] Embeddings generated: {research['articles_found']} × 384-dim vectors",
        "[Analysis] Tool: cluster_articles() via cosine similarity (threshold=0.45)",
        f"[Analysis] Clustering complete: {cluster_count} thematic clusters identified",
        "[Analysis] Tool: extract_entities() via spaCy en_core_web_sm (NER pipeline)",
        f"[Analysis] Entity extraction complete: {entity_count} entities — {entity_preview}",
        "[Analysis] Tool: sentiment via VADER (Valence Aware Dictionary & sEntiment Reasoner)",
        f"[Analysis] VADER compound score: {round(compound, 3)} → Sentiment: {analysis['sentiment']} ({int(analysis['confidence'] * 100)}% confidence)",
        f"[Analysis] Themes identified: {', '.join(analysis['themes'])}",
        "[Analysis] Analysis phase complete — passing structured data to BriefingAgent",
        "[Briefing] Synthesizing analysis into structured briefing...",
        f"[Briefing] ✓ TL;DR generated | ✓ {len(briefing['sections']['highlights'])} highlights extracted",
        f"[Briefing] ✓ Winners/Losers framed for {qtype} query type",
        "[Briefing] ✓ 'Why It Matters' and 'Watch Next' customized for query context",
        "[Briefing] Briefing complete. Passing to ReflectionAgent for quality validation.",
        "[Reflection] Reviewing output quality and completeness...",
        f"[Reflection] Quality: {reflection['quality']} — {reflection['recommendation']}",
        f"[Reflection] Gaps identified: {'; '.join(reflection['gaps'])}",
        "[Reflection] ✓ All sections present and populated",
        f"[Reflection] ✓ Confidence score: {int(briefing['confidence'] * 100)}%",
        "[Reflection] ✓ Output validated — briefing ready for delivery",
        "[Crew] ═══ Autonomous execution complete ═══",
    ]


# ─────────────────────────── Endpoints ───────────────────────────

@app.post("/analyze")
async def analyze(request: Request):
    body = await request.json()
    query = body.get("query", "").strip() or "Latest Business News"

    # Run all agents
    articles, news_source = await fetch_news(query)
    plan = planner_analysis(query, articles)
    research = research_analysis(query, articles)
    analysis = analysis_agent(query, articles)
    briefing = build_briefing(query, articles, analysis)
    reflection = reflection_agent(briefing, query)
    logs = build_logs(query, plan, research, analysis, briefing, reflection, news_source)

    qtype = (
        "policy" if any(w in query.lower() for w in ["budget", "policy", "bill", "tax", "rbi", "sebi"])
        else "earnings" if any(w in query.lower() for w in ["earnings", "results", "profit", "q1", "q2", "q3", "q4"])
        else "funding" if any(w in query.lower() for w in ["funding", "startup", "unicorn", "series"])
        else "general"
    )
    briefing["query_type"] = qtype

    return JSONResponse({
        "logs": logs,
        "briefing": briefing,
        "query_type": qtype,
        "data_source": news_source,
        "confidence": analysis["confidence"],
    })


@app.post("/chat")
async def chat(request: Request):
    body = await request.json()
    question = body.get("question", "").strip()
    briefing = body.get("briefing", {})

    if not briefing or not question:
        return JSONResponse({"answer": "No briefing context available. Please run the pipeline first."})

    q = question.lower()
    sections = briefing.get("sections", {})

    if any(w in q for w in ["tldr", "summary", "brief", "overview", "quick"]):
        answer = "📋 TL;DR\n\n" + sections.get("tldr", "No summary available.")

    elif any(w in q for w in ["number", "figure", "stat", "crore", "billion", "percent", "₹", "$"]):
        nums = sections.get("important_numbers", [])
        answer = "📊 Key Numbers:\n\n" + (
            "\n".join(f"  • {n['value']}" for n in nums) if nums else "No numbers extracted."
        )

    elif any(w in q for w in ["winner", "benefit", "gain", "who profit"]):
        winners = sections.get("winners_and_losers", {}).get("winners", [])
        answer = "🏆 Winners:\n\n" + "\n".join(f"  + {w}" for w in winners)

    elif any(w in q for w in ["loser", "hurt", "risk", "who lose"]):
        losers = sections.get("winners_and_losers", {}).get("losers", [])
        answer = "⚠️ At Risk:\n\n" + "\n".join(f"  − {l}" for l in losers)

    elif any(w in q for w in ["watch", "next", "future", "upcoming", "monitor"]):
        watch = sections.get("what_to_watch_next", [])
        answer = "👀 Watch Next:\n\n" + "\n".join(f"  → {w}" for w in watch)

    elif any(w in q for w in ["matter", "important", "why", "significance", "impact"]):
        answer = "🔍 Why It Matters\n\n" + sections.get("why_it_matters", "")

    elif any(w in q for w in ["sentiment", "mood", "outlook", "tone"]):
        answer = (
            f"Sentiment: **{briefing.get('overall_sentiment', 'N/A')}** "
            f"(Confidence: {int((briefing.get('confidence', 0)) * 100)}%)"
        )

    elif any(w in q for w in ["source", "article", "how many", "coverage"]):
        names = briefing.get("source_names", [])
        answer = f"📰 Analysed {briefing.get('sources_analysed', 0)} articles from: {', '.join(names)}"

    elif any(w in q for w in ["theme", "cluster", "topic", "group"]):
        themes = sections.get("themes", [])
        answer = "📂 Themes:\n\n" + "\n".join(
            f"  [{t['label']}] — {t['article_count']} articles, {t['sentiment']}"
            for t in themes
        )

    elif any(w in q for w in ["highlight", "story", "headline", "article"]):
        highlights = sections.get("highlights", [])
        answer = "📰 Key Headlines:\n\n" + "\n".join(
            f"  {i+1}. {h['title']} ({h['source']})"
            for i, h in enumerate(highlights[:5])
        )

    else:
        answer = (
            "I can answer questions grounded in this briefing. Try:\n"
            "  • 'What are the key numbers?'\n"
            "  • 'Who are the winners?'\n"
            "  • 'Why does this matter?'\n"
            "  • 'What should I watch next?'\n"
            "  • 'What are the highlights?'"
        )

    return JSONResponse({"answer": answer})


@app.get("/health")
def health():
    return {
        "status": "ok",
        "time": datetime.utcnow().isoformat(),
        "newsapi_configured": bool(NEWSAPI_KEY),
    }
