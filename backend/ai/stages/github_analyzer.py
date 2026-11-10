"""
GitHub Repository Codebase Analyzer & Infrastructure Suggester.
Inspects public and private GitHub repositories, discovers frameworks, databases,
background workers, and container configurations, and produces tailored AWS & Azure
cloud architecture recommendations.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any, Dict, List, Optional, Tuple
import urllib.parse
import httpx

from ai.llm_client import get_llm_client
from models.schemas import GitHubAnalysisRequest, GitHubAnalysisResponse, GitHubComponentFinding

logger = logging.getLogger(__name__)


def parse_github_url(url: str) -> Tuple[str, str, Optional[str]]:
    """
    Parses GitHub URL into (owner, repo, optional_branch).
    Supports:
      - https://github.com/owner/repo
      - https://github.com/owner/repo.git
      - https://github.com/owner/repo/tree/branch-name
      - github.com/owner/repo
    """
    clean_url = url.strip()
    if not clean_url.startswith(("http://", "https://")):
        clean_url = f"https://{clean_url}"

    parsed = urllib.parse.urlparse(clean_url)
    if "github.com" not in parsed.netloc.lower():
        raise ValueError(f"URL host '{parsed.netloc}' is not GitHub. Please provide a valid github.com repository URL.")

    parts = [p for p in parsed.path.strip("/").split("/") if p]
    if len(parts) < 2:
        raise ValueError("Invalid GitHub URL. Expected format: https://github.com/owner/repository")

    owner = parts[0]
    repo = parts[1]
    if repo.endswith(".git"):
        repo = repo[:-4]

    branch = None
    if len(parts) >= 4 and parts[2] == "tree":
        branch = "/".join(parts[3:])

    return owner, repo, branch


async def fetch_github_file_content(
    client: httpx.AsyncClient,
    owner: str,
    repo: str,
    branch: str,
    path: str,
    token: Optional[str] = None
) -> Optional[str]:
    """Fetches raw content of a specific file from GitHub."""
    headers = {
        "Accept": "application/vnd.github.v3.raw",
        "User-Agent": "CLOQS-AI-Cloud-Architect"
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"

    raw_url = f"https://raw.githubusercontent.com/{owner}/{repo}/{branch}/{path}"
    try:
        res = await client.get(raw_url, headers=headers, timeout=10.0)
        if res.status_code == 200:
            return res.text
    except Exception as e:
        logger.debug(f"Direct raw fetch failed for {path}, trying API contents: {e}")

    # Fallback to GitHub API contents
    api_url = f"https://api.github.com/repos/{owner}/{repo}/contents/{path}?ref={branch}"
    try:
        res = await client.get(api_url, headers=headers, timeout=10.0)
        if res.status_code == 200:
            return res.text
    except Exception as e:
        logger.warning(f"Failed to fetch content for {path}: {e}")

    return None


def inspect_manifest_contents(
    manifest_contents: Dict[str, str],
    all_file_paths: List[str]
) -> List[GitHubComponentFinding]:
    """
    Parses manifest file contents and detects application frameworks, databases,
    queues, caching layers, and container setups.
    """
    findings: List[GitHubComponentFinding] = []
    seen = set()

    def add_finding(category: str, name: str, detail: str, detected_in: Optional[str] = None):
        key = (category, name)
        if key not in seen:
            seen.add(key)
            findings.append(GitHubComponentFinding(
                category=category,
                name=name,
                confidence=0.95,
                detail=detail,
                detected_in=detected_in
            ))

    # 1. Inspect Docker and containerization
    dockerfiles = [p for p in all_file_paths if p.lower().endswith("dockerfile") or "dockerfile" in p.lower()]
    if dockerfiles:
        add_finding(
            "compute",
            "Docker Containerization",
            f"Found {len(dockerfiles)} Dockerfile(s): {', '.join(dockerfiles[:3])}",
            dockerfiles[0]
        )

    compose_files = [p for p in all_file_paths if any(c in p.lower() for c in ["docker-compose", "compose.yml", "compose.yaml"])]
    if compose_files:
        compose_content = manifest_contents.get(compose_files[0], "")
        add_finding(
            "compute",
            "Multi-Service Docker Compose",
            f"Configured multi-container service stack in {compose_files[0]}",
            compose_files[0]
        )
        if "postgres" in compose_content.lower():
            add_finding("database", "PostgreSQL", "Configured postgres container service in docker-compose", compose_files[0])
        if "redis" in compose_content.lower():
            add_finding("cache", "Redis Cache", "Configured redis container service in docker-compose", compose_files[0])
        if "rabbitmq" in compose_content.lower() or "rabbit" in compose_content.lower():
            add_finding("queue", "RabbitMQ Broker", "Configured rabbitmq service in docker-compose", compose_files[0])
        if "mysql" in compose_content.lower():
            add_finding("database", "MySQL", "Configured mysql container service in docker-compose", compose_files[0])
        if "mongo" in compose_content.lower():
            add_finding("database", "MongoDB", "Configured mongo container service in docker-compose", compose_files[0])

    # 2. Inspect Python manifests (requirements.txt, pyproject.toml, Pipfile)
    for path, content in manifest_contents.items():
        if "requirements" in path.lower() or "pyproject" in path.lower() or "pipfile" in path.lower():
            content_lower = content.lower()
            if "fastapi" in content_lower:
                add_finding("compute", "FastAPI Backend API", "High-performance Python async REST API framework", path)
            if "django" in content_lower:
                add_finding("compute", "Django Web Framework", "Full-featured Python web and API framework", path)
            if "flask" in content_lower:
                add_finding("compute", "Flask Web Framework", "Python microframework for REST APIs", path)
            if "celery" in content_lower:
                add_finding("queue", "Celery Asynchronous Task Workers", "Distributed background task and worker queue", path)
            if any(k in content_lower for k in ["psycopg2", "asyncpg", "sqlalchemy"]):
                add_finding("database", "PostgreSQL Database", "Relational SQL database client and ORM", path)
            if "pymongo" in content_lower or "motor" in content_lower:
                add_finding("database", "MongoDB", "Document-oriented NoSQL database client", path)
            if "redis" in content_lower or "aioredis" in content_lower:
                add_finding("cache", "Redis In-Memory Cache", "In-memory caching and session store", path)
            if "boto3" in content_lower:
                add_finding("storage", "AWS S3 Object Storage", "AWS Cloud SDK used for media and document storage", path)
            if any(k in content_lower for k in ["openai", "anthropic", "langchain", "llama"]):
                add_finding("compute", "LLM / AI Gateway Integration", "Generative AI or LLM routing integration", path)

    # 3. Inspect Node / JavaScript manifests (package.json)
    for path, content in manifest_contents.items():
        if path.lower().endswith("package.json"):
            try:
                pkg = json.loads(content)
                deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}
                deps_lower = {k.lower(): v for k, v in deps.items()}

                if "next" in deps_lower:
                    add_finding("framework", "Next.js (React Framework)", "Full-stack SSR / Static React web framework", path)
                elif "react" in deps_lower:
                    add_finding("framework", "React Single-Page App (SPA)", "Frontend component library and UI", path)
                if "vue" in deps_lower or "nuxt" in deps_lower:
                    add_finding("framework", "Vue.js / Nuxt", "Progressive frontend framework", path)
                if "express" in deps_lower:
                    add_finding("compute", "Express.js REST API", "Node.js HTTP server framework", path)
                if "@nestjs/core" in deps_lower or "nest" in deps_lower:
                    add_finding("compute", "NestJS Architecture", "Enterprise Node.js microservices framework", path)
                if "@prisma/client" in deps_lower or "prisma" in deps_lower:
                    add_finding("database", "Prisma ORM (PostgreSQL / MySQL)", "Next-generation database ORM", path)
                if "pg" in deps_lower or "typeorm" in deps_lower:
                    add_finding("database", "PostgreSQL", "PostgreSQL database client and connection pool", path)
                if "mongoose" in deps_lower or "mongodb" in deps_lower:
                    add_finding("database", "MongoDB", "MongoDB NoSQL document database client", path)
                if "redis" in deps_lower or "ioredis" in deps_lower or "bullmq" in deps_lower:
                    add_finding("cache", "Redis / BullMQ Queue", "Fast in-memory cache and background job manager", path)
                if "@aws-sdk/client-s3" in deps_lower or "aws-sdk" in deps_lower:
                    add_finding("storage", "AWS S3 Asset Storage", "Cloud object storage for static uploads", path)
            except Exception:
                pass

    # 4. Inspect Go manifests (go.mod)
    for path, content in manifest_contents.items():
        if path.lower().endswith("go.mod"):
            c_lower = content.lower()
            if "gin-gonic/gin" in c_lower:
                add_finding("compute", "Gin HTTP Engine", "High-throughput Go REST API", path)
            if "gorm.io/gorm" in c_lower:
                add_finding("database", "Relational Database (GORM)", "Go SQL ORM layer", path)
            if "go-redis" in c_lower:
                add_finding("cache", "Redis In-Memory Cache", "Go Redis cache client", path)

    # 5. Inspect Kubernetes & Helm
    k8s_files = [p for p in all_file_paths if any(k in p.lower() for k in ["k8s/", "helm/", "deploy/k8s", "kubernetes/"])]
    if k8s_files:
        add_finding(
            "compute",
            "Kubernetes (EKS / AKS Ready)",
            f"Existing deployment manifests detected in {', '.join(k8s_files[:2])}",
            k8s_files[0]
        )

    return findings


def generate_deterministic_infrastructure_blueprint(
    repo_name: str,
    owner: str,
    description: Optional[str],
    primary_language: str,
    findings: List[GitHubComponentFinding],
    traffic_scale: str,
    provider: str
) -> Tuple[str, str, List[str], List[str], Dict[str, float]]:
    """
    Creates tailored cloud architecture suggestions, recommended AWS/Azure services,
    and a ready-to-run natural language project prompt.
    """
    comp_names = [f.name for f in findings]
    has_k8s = any("kubernetes" in n.lower() for n in comp_names)
    has_docker = any("docker" in n.lower() for n in comp_names)
    has_db = any(f.category == "database" for f in findings)
    has_cache = any(f.category == "cache" for f in findings)
    has_queue = any(f.category == "queue" for f in findings)
    has_storage = any(f.category == "storage" for f in findings)
    has_frontend = any(f.category == "framework" for f in findings)

    # Scale parameters
    if traffic_scale == "small":
        user_concurrency = "50-100 concurrent users"
        ha_text = "Single-AZ burstable deployment (cost-optimized for staging/MVP)"
        db_tier = "db.t4g.small (AWS) / Standard_B1ms (Azure)"
        cost_range = {"min": 50.0, "max": 140.0}
    elif traffic_scale == "high":
        user_concurrency = "2,000-5,000 concurrent users"
        ha_text = "Multi-AZ high availability across 3 Availability Zones with automated horizontal pod autoscaling"
        db_tier = "db.r7g.xlarge Multi-AZ with Read Replica (AWS) / Azure Flexible Server GP 4 vCores (Azure)"
        cost_range = {"min": 550.0, "max": 1400.0}
    elif traffic_scale == "enterprise":
        user_concurrency = "10,000+ concurrent users"
        ha_text = "Enterprise Multi-Region active-active failover with Karpenter autoscaling and dedicated Redis Cluster"
        db_tier = "Amazon Aurora Serverless v2 PostgreSQL / Azure Cosmos DB + Managed SQL"
        cost_range = {"min": 1200.0, "max": 3500.0}
    else:  # medium (default)
        user_concurrency = "250-500 concurrent users"
        ha_text = "Multi-AZ deployment across 2 Availability Zones with 99.9% availability SLA"
        db_tier = "db.t4g.large Multi-AZ (AWS) / Standard_D2ds_v5 (Azure)"
        cost_range = {"min": 180.0, "max": 420.0}

    # Recommended AWS Services
    aws_services = []
    if has_k8s or (has_docker and traffic_scale in ["high", "enterprise"]):
        aws_services.extend(["Amazon EKS", "Amazon ECR", "AWS Application Load Balancer"])
    elif has_docker:
        aws_services.extend(["Amazon ECS (Fargate)", "Amazon ECR", "AWS Application Load Balancer"])
    else:
        aws_services.extend(["AWS App Runner", "Amazon CloudWatch"])

    if has_frontend:
        aws_services.extend(["Amazon CloudFront (CDN)", "Amazon S3 (Static Web Hosting)"])

    if has_db:
        aws_services.append("Amazon RDS PostgreSQL (Multi-AZ)")
    if has_cache:
        aws_services.append("Amazon ElastiCache for Redis")
    if has_queue:
        aws_services.append("Amazon SQS (Simple Queue Service)")
    if has_storage:
        aws_services.append("Amazon S3 (Encrypted Object Storage with Lifecycle)")
    aws_services.extend(["AWS Secrets Manager", "Amazon CloudWatch Container Insights"])

    # Recommended Azure Services
    azure_services = []
    if has_k8s or (has_docker and traffic_scale in ["high", "enterprise"]):
        azure_services.extend(["Azure Kubernetes Service (AKS)", "Azure Container Registry (ACR)", "Azure Application Gateway"])
    elif has_docker:
        azure_services.extend(["Azure Container Apps", "Azure Container Registry (ACR)", "Azure Load Balancer"])
    else:
        azure_services.extend(["Azure App Service (Linux)", "Azure Monitor"])

    if has_frontend:
        azure_services.extend(["Azure Static Web Apps", "Azure Front Door (CDN)"])

    if has_db:
        azure_services.append("Azure Database for PostgreSQL (Flexible Server)")
    if has_cache:
        azure_services.append("Azure Cache for Redis (Standard)")
    if has_queue:
        azure_services.append("Azure Service Bus")
    if has_storage:
        azure_services.append("Azure Blob Storage (ZRS Redundant)")
    azure_services.extend(["Azure Key Vault", "Azure Log Analytics"])

    # Compose synthesis prompt
    components_summary = []
    for f in findings:
        components_summary.append(f"- **{f.name}** ({f.category}): {f.detail}")
    comp_list_text = "\n".join(components_summary) if components_summary else "- Containerized microservice application"

    desc_line = f" ({description})" if description else ""
    prompt = (
        f"Production cloud architecture and sizing for repository '{owner}/{repo_name}'{desc_line}.\n\n"
        f"Key Application Stack & Components:\n"
        f"{comp_list_text}\n\n"
        f"Workload Requirements & Constraints:\n"
        f"- Target Concurrency: {user_concurrency}\n"
        f"- High Availability Posture: {ha_text}\n"
        f"- Database Sizing: {db_tier} with automated daily backups and 7-day retention\n"
        f"- Storage & Caching: Persistent object storage with encryption at rest, low-latency in-memory cache\n"
        f"- Observability: Centralized metrics, log aggregation, and single-point-of-failure alerts\n\n"
        f"Recommend optimized infrastructure topology for both AWS and Azure, calculate monthly and annual line-item estimates, "
        f"and provide FinOps recommendations to eliminate idle waste."
    )

    summary_md = (
        f"### Codebase Inspection: `{owner}/{repo_name}`\n\n"
        f"**Primary Stack**: {primary_language} &middot; **Target Scale**: {traffic_scale.capitalize()} ({user_concurrency})\n\n"
        f"#### Detected Architectural Components ({len(findings)} discovered):\n"
    )
    for f in findings:
        summary_md += f"- **{f.name}** (`{f.category}`): {f.detail}\n"

    summary_md += f"\n**Estimated Monthly Cloud Budget**: **${cost_range['min']:.0f} – ${cost_range['max']:.0f}/mo**"

    return prompt, summary_md, aws_services, azure_services, cost_range


async def analyze_github_repository(req: GitHubAnalysisRequest) -> GitHubAnalysisResponse:
    """
    Main entrypoint: parses URL, fetches GitHub repository tree and manifests,
    identifies application architecture, and crafts tailored cloud suggestions.
    """
    owner, repo, url_branch = parse_github_url(req.repo_url)
    target_branch = req.branch or url_branch

    headers = {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "CLOQS-AI-Cloud-Architect"
    }
    if req.github_token:
        headers["Authorization"] = f"Bearer {req.github_token}"

    async with httpx.AsyncClient(headers=headers, timeout=15.0, follow_redirects=True) as client:
        # 1. Fetch Repository Details
        repo_api_url = f"https://api.github.com/repos/{owner}/{repo}"
        repo_res = await client.get(repo_api_url)

        if repo_res.status_code == 404:
            raise ValueError(
                f"Repository '{owner}/{repo}' was not found or is private. "
                "If it is a private repository, please provide a GitHub Personal Access Token."
            )
        elif repo_res.status_code == 403 or repo_res.status_code == 429:
            # Check rate limiting
            msg = repo_res.json().get("message", "GitHub API rate limit exceeded")
            raise ValueError(f"GitHub API error: {msg}. You can supply a Personal Access Token to bypass public rate limits.")
        elif repo_res.status_code != 200:
            raise ValueError(f"Failed to query GitHub repository: HTTP {repo_res.status_code}")

        repo_data = repo_res.json()
        default_branch = target_branch or repo_data.get("default_branch", "main")
        description = repo_data.get("description")
        primary_lang = repo_data.get("language") or "Full-Stack"

        # 2. Fetch Recursive Git Tree
        tree_api_url = f"https://api.github.com/repos/{owner}/{repo}/git/trees/{default_branch}?recursive=1"
        tree_res = await client.get(tree_api_url)

        file_paths = []
        if tree_res.status_code == 200:
            tree_data = tree_res.json()
            file_paths = [item["path"] for item in tree_data.get("tree", []) if item.get("type") == "blob"]
        else:
            logger.warning(f"Could not fetch full recursive tree for {owner}/{repo}: HTTP {tree_res.status_code}")

        # 3. Identify and fetch key configuration manifests
        manifest_patterns = [
            r"(^|/)package\.json$",
            r"(^|/)requirements.*\.txt$",
            r"(^|/)pyproject\.toml$",
            r"(^|/)docker-compose.*\.ya?ml$",
            r"(^|/)compose.*\.ya?ml$",
            r"(^|/)[Dd]ockerfile.*$",
            r"(^|/)go\.mod$",
            r"(^|/)pom\.xml$",
            r"(^|/)build\.gradle$",
            r"(^|/)\.env\.example$"
        ]

        target_manifests = []
        for p in file_paths:
            for pattern in manifest_patterns:
                if re.search(pattern, p):
                    target_manifests.append(p)
                    break

        # Limit to top 8 most informative manifests to stay ultra-responsive
        target_manifests = target_manifests[:8]
        manifest_contents: Dict[str, str] = {}

        for manifest_path in target_manifests:
            content = await fetch_github_file_content(
                client=client,
                owner=owner,
                repo=repo,
                branch=default_branch,
                path=manifest_path,
                token=req.github_token
            )
            if content:
                manifest_contents[manifest_path] = content

    # 4. Parse components from manifests
    findings = inspect_manifest_contents(manifest_contents, file_paths)

    # 5. Build infrastructure recommendations
    prompt, summary_md, aws_services, azure_services, cost_range = generate_deterministic_infrastructure_blueprint(
        repo_name=repo,
        owner=owner,
        description=description,
        primary_language=primary_lang,
        findings=findings,
        traffic_scale=req.traffic_scale or "medium",
        provider=req.provider_preference or "both"
    )

    # 6. Optional: Enrich prompt with LLM if client is available
    try:
        llm = get_llm_client()
        detected_bullets = "\n".join([f"- {f.name} ({f.category}): {f.detail}" for f in findings])
        enrich_prompt = (
            f"You are a Principal Cloud Solutions Architect at CLOQS AI. A developer wants to deploy the GitHub repository "
            f"'{owner}/{repo}' ({primary_lang}).\n"
            f"Detected repository stack:\n{detected_bullets}\n\n"
            f"Write a crisp, authoritative 3-paragraph cloud architecture requirement prompt to size their AWS and Azure infrastructure. "
            f"Specify compute sizing, database clustering, caching, storage, and reliability targets for a {req.traffic_scale} workload."
        )
        llm_res = await llm.chat_completion(
            messages=[{"role": "user", "content": enrich_prompt}],
            system_prompt="You are an elite cloud solutions architect. Write structured technical workload requirements.",
            max_tokens=600,
            temperature=0.2
        )
        refined_text = llm_res.get("text") or llm_res.get("reply")
        if refined_text and len(refined_text.strip()) > 80:
            prompt = refined_text.strip()
    except Exception as e:
        logger.debug(f"LLM enrichment skipped or offline, using deterministic synthesis: {e}")

    frameworks = [f.name for f in findings if f.category in ["framework", "compute"]]

    suggested_name = f"{repo.replace('-', ' ').replace('_', ' ').title()} Cloud Platform"

    return GitHubAnalysisResponse(
        repo_name=repo,
        owner=owner,
        default_branch=default_branch,
        description=description,
        primary_language=primary_lang,
        frameworks=frameworks,
        detected_components=findings,
        recommended_services_aws=aws_services,
        recommended_services_azure=azure_services,
        suggested_project_name=suggested_name,
        suggested_prompt=prompt,
        summary_markdown=summary_md,
        estimated_monthly_range=cost_range,
        scanned_files_count=len(file_paths)
    )
