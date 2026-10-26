<div align="center">

# ☁️ CLOQS AI
### **AI-Powered Cloud Architecture & Cost Intelligence**
#### *Architect Smarter. Optimize Everything.*

**Autonomous Enterprise Multi-Cloud Architecture Designer & Real-Time FinOps Estimation Engine**

[![Next.js 14](https://img.shields.io/badge/Frontend-Next.js%2014-black?style=flat&logo=next.js)](https://nextjs.org/)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?style=flat&logo=fastapi)](https://fastapi.tiangolo.com/)
[![ReactFlow](https://img.shields.io/badge/Diagram-ReactFlow%20Interactive-ff0072?style=flat)](https://reactflow.dev/)
[![Docker Compose](https://img.shields.io/badge/Deploy-Docker%20Compose-2496ED?style=flat&logo=docker)](https://www.docker.com/)
[![AWS Pricing MCP](https://img.shields.io/badge/MCP-AWS%20Pricing%20Sidecar-FF9900?style=flat&logo=amazon-aws)](https://aws.amazon.com/)
[![Azure Retail Prices API](https://img.shields.io/badge/API-Azure%20Retail%20Rates-0089D6?style=flat&logo=microsoft-azure)](https://prices.azure.com/)

</div>

---

## 🌟 Executive Summary

**CLOQS AI** is an end-to-end autonomous Cloud Solutions Architect and FinOps planning system. It bridges the gap between high-level natural language business requirements and authoritative, mathematically validated cloud deployment budgets across **AWS** and **Microsoft Azure**.

Unlike generic cost estimators that rely on static heuristics or manual spreadsheet inputs, **CLOQS AI**:
1. **Discovers Requirements Interactively**: Conducts an intelligent multi-turn clarification interview with dynamic confidence scoring.
2. **Synthesizes Multi-Tier Architectures**: Generates real network and compute topologies rendered on a **60fps interactive ReactFlow diagram** with bi-directional editable connections.
3. **Simulates 3 Enterprise Scenarios**: Produces independent **Cost-Optimized**, **Recommended Production**, and **High-Availability (Multi-AZ / Zone-Redundant)** models with SKU-level granularity.
4. **Calculates Real-Time Rates via MCP & Live Cloud APIs**: Connects to the official AWS Pricing Calculator via Model Context Protocol (MCP) and Azure Retail Prices API to generate auditable `.csv` and `.xlsx` artifacts.
5. **Reconciles Enterprise TCO**: Segregates raw infrastructure costs from operational telemetry (e.g., CloudWatch Container Insights, Azure Monitor).
6. **Supports Post-Estimate Delta Updates**: Allows adding add-on services (e.g., Redis Cache, WAF, CDN) post-estimate with immediate delta re-pricing ($\Delta \$/\text{mo}$).

---

## 🏗️ System Architecture & Workflow

```mermaid
flowchart TD
    subgraph Client["Frontend (Next.js 14 + Tailwind + ReactFlow)"]
        UI["Modern Web UI / Spatial 3D Theme"]
        Chat["Interactive Clarification Chat"]
        Flow["60fps Topology Visualizer (4-Way Handles)"]
        Scen["Scenario Matrix & SKU Editor"]
        Est["Enterprise 3-Tier TCO & Artifact Hub"]
    end

    subgraph Backend["Core API & Engine (Python 3.13 + FastAPI)"]
        Router["FastAPI REST & WebSocket Gateway"]
        Orch["AI Stage Orchestrator"]
        
        subgraph Pipeline["Autonomous AI Reasoning Pipeline"]
            ReqExt["Requirements Extractor (Confidence Scoring)"]
            ClarEng["Clarification Engine (Adaptive Priority)"]
            ArchSel["Architecture Topology Graph Builder"]
            SizeEng["Deterministic SKU Sizing Engine"]
            ScenGen["Independent Scenario Generator"]
        end

        JobWorker["Background Job Worker (Asyncio + DB Fallback)"]
        RateLookup["Dynamic SKU Rate Lookup Engine"]
    end

    subgraph DataPricing["Authoritative Pricing & Data Services"]
        MCP["AWS Pricing Calculator MCP Sidecar (Port 8000)"]
        AzureAPI["Azure Retail Prices Live API"]
        PG[(PostgreSQL 16 Database)]
        Disk[("Verified Artifact Store (.xlsx / .csv)")]
    end

    UI --> Router
    Chat <--> ClarEng
    Flow <--> ArchSel
    Scen <--> ScenGen
    Est <--> JobWorker

    Router --> Orch
    Orch --> ReqExt --> ClarEng --> ArchSel --> SizeEng --> ScenGen
    JobWorker --> RateLookup
    JobWorker --> MCP
    JobWorker --> AzureAPI
    JobWorker --> Disk
    Orch <--> PG
    JobWorker <--> PG
```

---

## ⚡ Key Highlights & Core Capabilities

### 1. 🎯 Interactive Topology Flowchart with 60fps Drag & Connect
- Powered by `useNodesState` and `useEdgesState` for smooth mouse-tracking at 60fps without layout lag.
- **Multi-Directional Ports**: Connect nodes via Top, Bottom, Left, or Right handles.
- **Interactive Editing**: Draw new connection paths, adjust layout, and select edges with <kbd>Delete</kbd> or <kbd>Backspace</kbd> to sever links. State is saved automatically to PostgreSQL via REST API.

### 2. 🔀 Post-Estimate Delta Update Engine
- Frequently, architects need to introduce complementary services after generating an estimate (e.g., an in-memory caching tier, edge security, or an object store).
- **One-Click Presets**: Choose from pre-configured enterprise components like ElastiCache Redis, AWS WAF, CloudFront CDN, SQS, Azure Redis, Front Door, or Azure Firewall.
- **Instant Re-Pricing**: Calculates the exact incremental cost ($\Delta \$/\text{mo}$) and triggers a delta execution pipeline that re-generates downloadable Excel/CSV reports without losing previous configurations.

### 3. 📊 Three-Tier Enterprise TCO Reconciliation
Resolves the common discrepancy between cloud calculators and actual real-world production bills:
- **Tier 1 (Direct Infrastructure)**: Compute, node pools, disk storage, and managed databases (1:1 match with official cloud calculators).
- **Tier 2 (Operational Telemetry)**: CloudWatch / Azure Monitor metrics, Container Insights, log ingestion, and alarms.
- **Tier 3 (Total Monthly Enterprise TCO)**: True comprehensive operational budget ($\text{Infra} + \text{Ops}$).

### 4. 🔮 Dual-Theme Visual Experience
- **Enterprise Light Theme**: Clean, accessible, slate-and-blue interface tailored for executive presentations and client reviews.
- **Spatial UI / Futuristic Mode**: Glassmorphic neon-accented cyberpunk UI with ambient glow, responsive floating quick-switch dock, and futuristic styling.

---

## 🚀 Quickstart Guide

### Prerequisites
- [Docker](https://docs.docker.com/get-docker/) & [Docker Compose](https://docs.docker.com/compose/)
- Anthropic API Key (`ANTHROPIC_API_KEY`)

### 1. Clone & Configure Environment
```bash
git clone https://github.com/your-username/stratos-ai.git
cd stratos-ai
cp .env.example .env
```
Ensure `.env` contains your Anthropic API Key and database credentials:
```env
ANTHROPIC_API_KEY=sk-ant-api03-...
DATABASE_URL=postgresql+asyncpg://postgres:postgres@postgres:5432/cloudcost
DEMO_EMAIL=demo@cloudcost.ai
DEMO_PASSWORD=changeme
```

### 2. Launch with Docker Compose
```bash
docker compose up -d --build
```

### 3. Access Services
- **Web Application**: [http://localhost:3000](http://localhost:3000)
- **FastAPI OpenAPI Docs**: [http://localhost:8001/docs](http://localhost:8001/docs)
- **AWS MCP Server**: [http://localhost:8000](http://localhost:8000)

*Default Login Credentials*: `demo@cloudcost.ai` / `changeme`

---

## 📁 Repository Structure

```
├── .gitignore                   # Excludes .env, build caches, artifacts & virtual environments
├── docker-compose.yml           # Multi-container orchestration (App, DB, MCP, Frontend)
├── backend/
│   ├── ai/                      # AI Orchestration, LLM client, Clarification & Sizing rules
│   ├── api/v1/                  # REST API routes (Projects, Scenarios, Architecture, Estimates)
│   ├── core/                    # Config, Security, Storage, Database session management
│   ├── export/                  # Multi-tab Excel (.xlsx) and CSV generators with checksum validation
│   ├── jobs/                    # Async Background worker with orphan recovery & DB fallback
│   ├── models/                  # SQLAlchemy async models & Pydantic v2 schemas
│   └── pricing/                 # AWS MCP client, Azure Retail Prices API, and rate tables
└── frontend/
    └── src/
        ├── app/                 # Next.js 14 App Router (Discover, Architecture, Scenarios, Estimates)
        ├── components/
        │   ├── architecture/    # ReactFlow 60fps Topology Visualizer
        │   ├── conversation/    # Requirements Chat & Clarification cards
        │   ├── estimates/       # Job progress & Enterprise TCO breakdown
        │   ├── layout/          # Navbar, Sidebar, SpatialThemeToggle
        │   └── scenarios/       # AddServiceModal (Delta Updates), comparison matrix
        └── lib/                 # Auth tokens, API client, custom hooks
```

---

## 🛡️ License
Licensed under the [Apache 2.0 License](LICENSE).
