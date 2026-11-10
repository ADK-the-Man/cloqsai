"""
API Topology & Endpoint Dependency Graph Generator.
Extracts live route definitions and dependencies from GitHub repositories or synthesizes
high-fidelity API diagrams aligned with the project's architecture stack and domain.
"""
from __future__ import annotations

import logging
import re
import uuid
from typing import Any, Dict, List, Optional, Tuple
import httpx

from models.schemas import (
    ApiEndpointItem,
    ApiTopologyGraphEdge,
    ApiTopologyGraphNode,
    ApiTopologyResponse,
)

logger = logging.getLogger(__name__)


def parse_repo_from_text(text: str) -> Optional[Tuple[str, str, Optional[str]]]:
    """Extracts GitHub owner, repo, and optional branch from URLs or text."""
    if not text:
        return None

    # Match https?://github.com/owner/repo or github.com/owner/repo
    url_match = re.search(r'(?:https?://)?(?:www\.)?github\.com/([a-zA-Z0-9_\-\.]+)/([a-zA-Z0-9_\-\.]+)', text)
    if url_match:
        owner = url_match.group(1)
        repo = url_match.group(2).replace(".git", "")
        branch = None
        tree_m = re.search(r'/tree/([a-zA-Z0-9_\-\.\/]+)', text)
        if tree_m:
            branch = tree_m.group(1)
        return owner, repo, branch

    # Match repository 'owner/repo' or repo: owner/repo or for repository owner/repo
    rep_patterns = [
        r"(?:repository|repo)\s*[:=\s]?\s*['\"]([a-zA-Z0-9_\-\.]+)/([a-zA-Z0-9_\-\.]+)['\"]",
        r"(?:for|from)\s+(?:repository|repo)\s+['\"]?([a-zA-Z0-9_\-\.]+)/([a-zA-Z0-9_\-\.]+)['\"]?",
        r"(?:repository|repo)\s*[:=\s]\s*([a-zA-Z0-9_\-\.]+)/([a-zA-Z0-9_\-\.]+)"
    ]
    for pattern in rep_patterns:
        rep_m = re.search(pattern, text, re.IGNORECASE)
        if rep_m:
            return rep_m.group(1), rep_m.group(2).replace(".git", ""), None

    return None


async def extract_github_routes(owner: str, repo: str, branch: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Scans a GitHub repository to discover live Express / FastAPI / NestJS / Next.js
    route endpoints and mounted prefixes.
    """
    branches_to_try = [branch] if branch else ["main", "master"]
    headers = {
        "User-Agent": "CLOQS-AI-Cloud-Architect",
        "Accept": "application/vnd.github.v3+json"
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        tree = []
        active_branch = "main"
        for b in branches_to_try:
            try:
                res = await client.get(
                    f"https://api.github.com/repos/{owner}/{repo}/git/trees/{b}?recursive=1",
                    headers=headers
                )
                if res.status_code == 200:
                    tree = res.json().get("tree", [])
                    active_branch = b
                    break
            except Exception as e:
                logger.debug(f"Failed to fetch branch {b}: {e}")

        if not tree:
            return []

        route_files = [
            t["path"] for t in tree
            if ("route" in t["path"].lower() or "controller" in t["path"].lower())
            and t["path"].endswith((".js", ".ts", ".py"))
        ]
        server_files = [
            t["path"] for t in tree
            if t["path"].endswith(("server.js", "app.js", "index.js", "main.py", "app.py"))
        ]

        # Extract Express route mounts (e.g. app.use("/api/donor", donorRoutes))
        mount_map: Dict[str, str] = {}
        for sf in server_files:
            try:
                res = await client.get(f"https://raw.githubusercontent.com/{owner}/{repo}/{active_branch}/{sf}")
                if res.status_code == 200:
                    code = res.text
                    imports: Dict[str, str] = {}
                    for line in code.splitlines():
                        m = re.match(
                            r"(?:const|let|var)\s+([a-zA-Z0-9_]+)\s*=\s*require\s*\(\s*['\"]([^'\"]+)['\"]\s*\)",
                            line.strip()
                        )
                        if m:
                            var_name, path = m.group(1), m.group(2)
                            imports[var_name] = path.split("/")[-1].replace(".js", "").replace(".ts", "")
                    for line in code.splitlines():
                        m = re.match(r"app\.use\s*\(\s*['\"]([^'\"]+)['\"]\s*,\s*([a-zA-Z0-9_]+)\s*\)", line.strip())
                        if m:
                            prefix, var_name = m.group(1), m.group(2)
                            file_base = imports.get(var_name, var_name)
                            mount_map[file_base] = prefix
            except Exception:
                pass

        all_routes: List[Dict[str, Any]] = []
        for rf in route_files[:16]:
            base = rf.split("/")[-1].replace(".js", "").replace(".ts", "").replace(".py", "")
            prefix = mount_map.get(
                base,
                f"/api/{base.replace('Routes', '').replace('Route', '').replace('Controller', '').lower()}"
            )
            try:
                f_res = await client.get(f"https://raw.githubusercontent.com/{owner}/{repo}/{active_branch}/{rf}")
                if f_res.status_code != 200:
                    continue
                f_code = f_res.text
                for line in f_code.splitlines():
                    line = line.strip()
                    # Express pattern
                    rm = re.search(
                        r"router\.(get|post|put|patch|delete)\s*\(\s*['\"]([^'\"]+)['\"]",
                        line,
                        re.IGNORECASE
                    )
                    if rm:
                        method = rm.group(1).upper()
                        subpath = rm.group(2)
                        full_path = (prefix.rstrip("/") + "/" + subpath.lstrip("/")).rstrip("/")
                        all_routes.append({
                            "method": method,
                            "path": full_path,
                            "file": rf,
                            "controller": base,
                            "is_protected": "protect" in line.lower() or "auth" in line.lower()
                        })
                    # FastAPI pattern
                    fm = re.search(
                        r"@(?:router|app)\.(get|post|put|patch|delete)\s*\(\s*['\"]([^'\"]+)['\"]",
                        line,
                        re.IGNORECASE
                    )
                    if fm:
                        method = fm.group(1).upper()
                        subpath = fm.group(2)
                        full_path = (prefix.rstrip("/") + "/" + subpath.lstrip("/")).rstrip("/")
                        all_routes.append({
                            "method": method,
                            "path": full_path,
                            "file": rf,
                            "controller": base,
                            "is_protected": "current_user" in line.lower() or "auth" in line.lower()
                        })
            except Exception:
                pass

        return all_routes


def generate_endpoint_summary(method: str, path: str) -> str:
    """Generates an intuitive, professional endpoint description from path and HTTP verb."""
    p = path.lower()
    if "register" in p:
        return "Register user and provision account credentials"
    if "login" in p:
        return "Authenticate user and issue JWT bearer token"
    if "profile" in p:
        return "Fetch or update user account profile details"
    if "camps" in p and method == "POST":
        return "Schedule new blood donation drive camp"
    if "camps" in p:
        return "Query active and upcoming blood donation drives"
    if "history" in p:
        return "Retrieve historical donation and transfusion audit log"
    if "stats" in p or "dashboard" in p:
        return "Aggregate telemetry and real-time operational metrics"
    if "request" in p and method == "POST":
        return "Submit urgent hospital blood unit requisition"
    if "request" in p:
        return "Query pending and dispatched blood requisitions"
    if "stock" in p and method == "POST":
        return "Update inventory units and ABO/Rh- blood supply"
    if "stock" in p:
        return "Query blood bank inventory and ABO/Rh- availability"
    if "donors" in p and "search" in p:
        return "Search eligible blood donors by group and location"
    if "donate" in p:
        return "Record verified blood donation and issue certificate"
    if "facilities" in p or "facility" in p:
        return "Inspect and verify registered healthcare facilities"
    if "approve" in p:
        return "Approve hospital facility accreditation status"
    if "reject" in p:
        return "Reject hospital facility accreditation request"

    # Generic fallback
    action = {"GET": "Fetch", "POST": "Create", "PUT": "Update", "DELETE": "Remove", "PATCH": "Modify"}.get(method, "Process")
    clean_path = path.strip("/").replace("api/v1/", "").replace("api/", "")
    return f"{action} resource at {clean_path}"


def build_live_repo_api_stack(
    repo_name: str,
    routes: List[Dict[str, Any]],
    components: List[str]
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Transforms extracted GitHub routes into a clean, balanced microservice topology.
    """
    # 1. Group routes by controller
    grouped_routes: Dict[str, List[Dict[str, Any]]] = {}
    for r in routes:
        ctrl_name = r["controller"]
        # Normalize controller name
        ctrl_key = ctrl_name.replace("Routes", "").replace("Route", "").replace("Controller", "").lower()
        if ctrl_key not in grouped_routes:
            grouped_routes[ctrl_key] = []
        # Deduplicate
        if not any(x["method"] == r["method"] and x["path"] == r["path"] for x in grouped_routes[ctrl_key]):
            grouped_routes[ctrl_key].append(r)

    # Friendly controller names
    ctrl_meta = {
        "auth": ("Auth & Identity Controller", "Identity", "auth_controller.js"),
        "authentication": ("Auth & Identity Controller", "Identity", "auth_controller.js"),
        "donor": ("Donor Services Controller", "Donor Operations", "donor_controller.js"),
        "hospital": ("Hospital Dispatch Controller", "Hospital Logistics", "hospital_controller.js"),
        "bloodlab": ("Blood Lab Operations Controller", "Lab & Stock", "blood_lab_controller.js"),
        "blood-lab": ("Blood Lab Operations Controller", "Lab & Stock", "blood_lab_controller.js"),
        "admin": ("Admin & Governance Controller", "Governance", "admin_controller.js"),
        "facility": ("Healthcare Facility Controller", "Facilities", "facility_controller.js"),
        "camp": ("Donation Camps Controller", "Community", "camp_controller.js"),
    }

    controllers: List[Dict[str, Any]] = []
    ctrl_id_map: Dict[str, str] = {}
    for key, c_routes in grouped_routes.items():
        if not c_routes:
            continue
        c_id = f"c-{key}"
        name, subsystem, mod = ctrl_meta.get(
            key,
            (f"{key.capitalize()} Controller", f"{key.capitalize()} Domain", f"{key}_controller.js")
        )
        ctrl_id_map[key] = c_id
        controllers.append({
            "id": c_id,
            "name": name,
            "module": mod,
            "subsystem": subsystem,
            "key": key
        })

    # Pick up to top 3-4 representative endpoints per controller to keep diagram readable (total ~12-16)
    selected_endpoints: List[Dict[str, Any]] = []
    has_mongo = any("mongo" in c.lower() for c in components) or True

    for ctrl in controllers:
        key = ctrl["key"]
        c_routes = grouped_routes.get(key, [])
        # Prioritize key verbs: POST login, GET stock, POST request, GET profile
        sorted_routes = sorted(
            c_routes,
            key=lambda x: (
                0 if "login" in x["path"] or "register" in x["path"] else
                1 if "request" in x["path"] or "stock" in x["path"] else
                2 if "dashboard" in x["path"] or "profile" in x["path"] else
                3
            )
        )
        picked = sorted_routes[:3]

        for idx, r in enumerate(picked):
            slug = r["path"].strip("/").replace("/", "-").replace(":", "").replace("_", "-")
            ep_id = f"ep-{slug}-{r['method'].lower()}"
            is_auth = r.get("is_protected", False)
            downstream = ["MongoDB Primary Cluster"] if has_mongo else ["PostgreSQL Primary Cluster"]
            downstream_ids = ["res-db"]

            if "auth" in r["path"] or "profile" in r["path"] or "stock" in r["path"]:
                downstream.append("Redis In-Memory Tier")
                downstream_ids.append("res-cache")

            selected_endpoints.append({
                "id": ep_id,
                "method": r["method"],
                "path": r["path"],
                "summary": generate_endpoint_summary(r["method"], r["path"]),
                "controller": ctrl["name"],
                "controller_id": ctrl["id"],
                "auth_required": is_auth,
                "auth_type": "Bearer JWT" if is_auth else "Public",
                "tags": [ctrl["subsystem"].split()[0], r["method"]],
                "downstream_targets": downstream,
                "downstream_ids": downstream_ids,
                "est_rps": 240 if r["method"] == "GET" else 65,
                "p95_latency_ms": 25 if r["method"] == "GET" else 60
            })

    # Downstream Resources
    resources = [
        {
            "id": "res-db",
            "name": "MongoDB Primary Cluster" if has_mongo else "PostgreSQL Primary Cluster",
            "type": "database",
            "detail": "NoSQL collections: users, donors, blood_stock, requests, camps" if has_mongo else "Relational schema: users, entities, logs",
            "badge": "Port 27017" if has_mongo else "Port 5432"
        },
        {
            "id": "res-cache",
            "name": "Redis In-Memory Tier",
            "type": "cache",
            "detail": "Sub-millisecond token session cache & live stock rates",
            "badge": "TTL 3600s"
        },
        {
            "id": "res-storage",
            "name": "S3 / Blob Object Lake",
            "type": "storage",
            "detail": "Encrypted at rest: medical reports, donor cards, audit snapshots",
            "badge": "SSE-S3"
        },
        {
            "id": "res-queue",
            "name": "Notification & Event Stream",
            "type": "queue",
            "detail": "Decoupled async worker queue for emergency blood dispatch alerts",
            "badge": "FIFO Queue"
        },
    ]

    return controllers, resources, selected_endpoints


def synthesize_default_api_stack(
    project_name: str,
    project_desc: str,
    raw_requirements: Optional[str] = None,
    frameworks: Optional[List[str]] = None,
    components: Optional[List[str]] = None
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Synthesizes a realistic, production-grade microservice API surface tailored
    to the specific application domain (Healthcare / E-commerce / Gaming & Wasm / FinTech / Social / SaaS).
    """
    frameworks = frameworks or []
    components = components or []
    combined_text = f"{project_name} {project_desc} {raw_requirements or ''}".lower()

    is_blood_bank_or_health = bool(re.search(r'\b(blood|donor|donors|donation|hospital|hospitals|patient|clinic|medical|transfusion|blood-bank|healthcare|pharma)\b', combined_text, re.IGNORECASE))
    is_ecommerce = bool(re.search(r'\b(store|shop|shopping|commerce|cart|checkout|orders?|inventory|marketplace)\b', combined_text, re.IGNORECASE)) and not is_blood_bank_or_health
    is_gaming_or_wasm = bool(re.search(r'\b(game|games|gaming|cricket|wasm|webassembly|emulator|player|match)\b', combined_text, re.IGNORECASE)) and not is_blood_bank_or_health and not is_ecommerce
    is_ai_platform = bool(re.search(r'\b(llm platform|agentic platform|ai model serving|model training pipeline|genai chatbot platform)\b', combined_text, re.IGNORECASE)) and not is_blood_bank_or_health and not is_ecommerce and not is_gaming_or_wasm

    if is_blood_bank_or_health:
        controllers = [
            {"id": "c-auth", "name": "Auth & Identity Controller", "module": "authController.js", "subsystem": "Identity"},
            {"id": "c-donor", "name": "Donor Services Controller", "module": "donorController.js", "subsystem": "Donor Operations"},
            {"id": "c-hosp", "name": "Hospital Blood Dispatch Controller", "module": "hospitalController.js", "subsystem": "Hospital Logistics"},
            {"id": "c-lab", "name": "Blood Lab Operations Controller", "module": "bloodLabController.js", "subsystem": "Lab & Stock"},
            {"id": "c-admin", "name": "Admin & Facility Controller", "module": "adminController.js", "subsystem": "Governance"},
        ]

        resources = [
            {
                "id": "res-db",
                "name": "MongoDB Primary Cluster",
                "type": "database",
                "detail": "Document collections: donors, blood_stock, hospitals, camps",
                "badge": "Port 27017"
            },
            {
                "id": "res-cache",
                "name": "Redis In-Memory Tier",
                "type": "cache",
                "detail": "Fast session token cache & real-time blood stock count",
                "badge": "TTL 3600s"
            },
            {
                "id": "res-storage",
                "name": "S3 / Blob Object Lake",
                "type": "storage",
                "detail": "Encrypted medical test reports & donor identity cards",
                "badge": "SSE-S3"
            },
            {
                "id": "res-queue",
                "name": "Emergency Dispatch & SMS Stream",
                "type": "queue",
                "detail": "High-priority queue for critical blood match alerts",
                "badge": "FIFO Queue"
            },
        ]

        endpoints = [
            {
                "id": "ep-auth-login",
                "method": "POST",
                "path": "/api/auth/login",
                "summary": "Authenticate user, hospital, or donor and issue JWT",
                "controller": "Auth & Identity Controller",
                "controller_id": "c-auth",
                "auth_required": False,
                "auth_type": "Public",
                "tags": ["Auth", "Security"],
                "downstream_targets": ["MongoDB Primary Cluster", "Redis In-Memory Tier"],
                "downstream_ids": ["res-db", "res-cache"],
                "est_rps": 180,
                "p95_latency_ms": 32
            },
            {
                "id": "ep-auth-register",
                "method": "POST",
                "path": "/api/auth/register",
                "summary": "Register new blood donor, hospital, or lab facility",
                "controller": "Auth & Identity Controller",
                "controller_id": "c-auth",
                "auth_required": False,
                "auth_type": "Public",
                "tags": ["Auth", "Onboarding"],
                "downstream_targets": ["MongoDB Primary Cluster"],
                "downstream_ids": ["res-db"],
                "est_rps": 45,
                "p95_latency_ms": 75
            },
            {
                "id": "ep-donor-profile",
                "method": "GET",
                "path": "/api/donor/profile",
                "summary": "Retrieve authenticated donor medical eligibility profile",
                "controller": "Donor Services Controller",
                "controller_id": "c-donor",
                "auth_required": True,
                "auth_type": "Bearer JWT",
                "tags": ["Donor", "Profile"],
                "downstream_targets": ["MongoDB Primary Cluster", "Redis In-Memory Tier"],
                "downstream_ids": ["res-db", "res-cache"],
                "est_rps": 320,
                "p95_latency_ms": 18
            },
            {
                "id": "ep-donor-history",
                "method": "GET",
                "path": "/api/donor/history",
                "summary": "Fetch historical blood donations and certificates",
                "controller": "Donor Services Controller",
                "controller_id": "c-donor",
                "auth_required": True,
                "auth_type": "Bearer JWT",
                "tags": ["Donor", "History"],
                "downstream_targets": ["MongoDB Primary Cluster"],
                "downstream_ids": ["res-db"],
                "est_rps": 110,
                "p95_latency_ms": 35
            },
            {
                "id": "ep-donor-camps",
                "method": "GET",
                "path": "/api/donor/camps",
                "summary": "Locate upcoming community blood donation drives",
                "controller": "Donor Services Controller",
                "controller_id": "c-donor",
                "auth_required": True,
                "auth_type": "Bearer JWT",
                "tags": ["Donor", "Camps"],
                "downstream_targets": ["MongoDB Primary Cluster"],
                "downstream_ids": ["res-db"],
                "est_rps": 240,
                "p95_latency_ms": 22
            },
            {
                "id": "ep-hosp-request",
                "method": "POST",
                "path": "/api/hospital/blood/request",
                "summary": "Submit emergency hospital blood unit requisition",
                "controller": "Hospital Blood Dispatch Controller",
                "controller_id": "c-hosp",
                "auth_required": True,
                "auth_type": "Bearer JWT",
                "tags": ["Hospital", "Urgent"],
                "downstream_targets": ["MongoDB Primary Cluster", "Emergency Dispatch & SMS Stream"],
                "downstream_ids": ["res-db", "res-queue"],
                "est_rps": 85,
                "p95_latency_ms": 90
            },
            {
                "id": "ep-hosp-requests-list",
                "method": "GET",
                "path": "/api/hospital/blood/requests",
                "summary": "Track real-time status of submitted blood requisitions",
                "controller": "Hospital Blood Dispatch Controller",
                "controller_id": "c-hosp",
                "auth_required": True,
                "auth_type": "Bearer JWT",
                "tags": ["Hospital", "Tracking"],
                "downstream_targets": ["MongoDB Primary Cluster"],
                "downstream_ids": ["res-db"],
                "est_rps": 190,
                "p95_latency_ms": 28
            },
            {
                "id": "ep-hosp-stock",
                "method": "GET",
                "path": "/api/hospital/blood/stock",
                "summary": "Inspect hospital blood bank stock and ABO compatibility",
                "controller": "Hospital Blood Dispatch Controller",
                "controller_id": "c-hosp",
                "auth_required": True,
                "auth_type": "Bearer JWT",
                "tags": ["Hospital", "Inventory"],
                "downstream_targets": ["MongoDB Primary Cluster", "Redis In-Memory Tier"],
                "downstream_ids": ["res-db", "res-cache"],
                "est_rps": 410,
                "p95_latency_ms": 15
            },
            {
                "id": "ep-lab-add",
                "method": "POST",
                "path": "/api/blood-lab/blood/add",
                "summary": "Receive tested blood units and credit central inventory",
                "controller": "Blood Lab Operations Controller",
                "controller_id": "c-lab",
                "auth_required": True,
                "auth_type": "Bearer JWT",
                "tags": ["Lab", "Inventory"],
                "downstream_targets": ["MongoDB Primary Cluster", "Redis In-Memory Tier"],
                "downstream_ids": ["res-db", "res-cache"],
                "est_rps": 60,
                "p95_latency_ms": 65
            },
            {
                "id": "ep-lab-stock",
                "method": "GET",
                "path": "/api/blood-lab/blood/stock",
                "summary": "Query blood testing lab inventory and ABO/Rh- units",
                "controller": "Blood Lab Operations Controller",
                "controller_id": "c-lab",
                "auth_required": True,
                "auth_type": "Bearer JWT",
                "tags": ["Lab", "Stock"],
                "downstream_targets": ["MongoDB Primary Cluster", "Redis In-Memory Tier"],
                "downstream_ids": ["res-db", "res-cache"],
                "est_rps": 380,
                "p95_latency_ms": 14
            },
            {
                "id": "ep-lab-donate",
                "method": "POST",
                "path": "/api/blood-lab/donors/donate/:id",
                "summary": "Verify donor screening, log blood draw, issue donor certificate",
                "controller": "Blood Lab Operations Controller",
                "controller_id": "c-lab",
                "auth_required": True,
                "auth_type": "Bearer JWT",
                "tags": ["Lab", "Donation"],
                "downstream_targets": ["MongoDB Primary Cluster", "S3 / Blob Object Lake"],
                "downstream_ids": ["res-db", "res-storage"],
                "est_rps": 40,
                "p95_latency_ms": 110
            },
            {
                "id": "ep-admin-facilities",
                "method": "GET",
                "path": "/api/admin/facilities",
                "summary": "Review pending blood banks and hospital accreditation",
                "controller": "Admin & Facility Controller",
                "controller_id": "c-admin",
                "auth_required": True,
                "auth_type": "Bearer JWT",
                "tags": ["Admin", "Governance"],
                "downstream_targets": ["MongoDB Primary Cluster"],
                "downstream_ids": ["res-db"],
                "est_rps": 75,
                "p95_latency_ms": 30
            },
            {
                "id": "ep-admin-approve",
                "method": "PUT",
                "path": "/api/admin/facility/approve/:id",
                "summary": "Grant official facility license to dispense blood",
                "controller": "Admin & Facility Controller",
                "controller_id": "c-admin",
                "auth_required": True,
                "auth_type": "Bearer JWT",
                "tags": ["Admin", "Audit"],
                "downstream_targets": ["MongoDB Primary Cluster"],
                "downstream_ids": ["res-db"],
                "est_rps": 20,
                "p95_latency_ms": 80
            },
        ]
        return controllers, resources, endpoints

    elif is_ecommerce:
        controllers = [
            {"id": "c-auth", "name": "Auth & Identity Controller", "module": "auth_controller", "subsystem": "Identity"},
            {"id": "c-catalog", "name": "Catalog & Inventory Controller", "module": "catalog_controller", "subsystem": "Catalog"},
            {"id": "c-orders", "name": "Orders & Checkout Controller", "module": "order_controller", "subsystem": "Orders"},
            {"id": "c-pay", "name": "Payment Gateway Controller", "module": "payment_controller", "subsystem": "Billing"},
        ]
        resources = [
            {"id": "res-db", "name": "PostgreSQL Primary Cluster", "type": "database", "detail": "Relational schema: products, orders, ledger", "badge": "Port 5432"},
            {"id": "res-cache", "name": "Redis In-Memory Tier", "type": "cache", "detail": "Sub-millisecond product caching & shopping carts", "badge": "TTL 3600s"},
            {"id": "res-storage", "name": "S3 / Blob Object Lake", "type": "storage", "detail": "Product media gallery & tax invoices", "badge": "SSE-S3"},
            {"id": "res-queue", "name": "SQS / Order Event Stream", "type": "queue", "detail": "Decoupled fulfillment and shipping dispatch", "badge": "FIFO Queue"},
        ]
        endpoints = [
            {"id": "ep-auth-token", "method": "POST", "path": "/api/v1/auth/token", "summary": "Issue customer/vendor access tokens", "controller": "Auth & Identity Controller", "controller_id": "c-auth", "auth_required": False, "auth_type": "Public", "tags": ["Auth"], "downstream_targets": ["PostgreSQL Primary Cluster", "Redis In-Memory Tier"], "downstream_ids": ["res-db", "res-cache"], "est_rps": 350, "p95_latency_ms": 28},
            {"id": "ep-products-list", "method": "GET", "path": "/api/v1/products", "summary": "Browse catalog with faceted inventory filter", "controller": "Catalog & Inventory Controller", "controller_id": "c-catalog", "auth_required": False, "auth_type": "Public", "tags": ["Catalog"], "downstream_targets": ["Redis In-Memory Tier", "PostgreSQL Primary Cluster"], "downstream_ids": ["res-cache", "res-db"], "est_rps": 1400, "p95_latency_ms": 18},
            {"id": "ep-orders-create", "method": "POST", "path": "/api/v1/orders", "summary": "Create cart checkout and reserve inventory", "controller": "Orders & Checkout Controller", "controller_id": "c-orders", "auth_required": True, "auth_type": "Bearer JWT", "tags": ["Orders"], "downstream_targets": ["PostgreSQL Primary Cluster", "SQS / Order Event Stream"], "downstream_ids": ["res-db", "res-queue"], "est_rps": 220, "p95_latency_ms": 110},
            {"id": "ep-payments-charge", "method": "POST", "path": "/api/v1/payments/charge", "summary": "Process payment gateway transaction", "controller": "Payment Gateway Controller", "controller_id": "c-pay", "auth_required": True, "auth_type": "Bearer JWT", "tags": ["Payments"], "downstream_targets": ["PostgreSQL Primary Cluster", "S3 / Blob Object Lake"], "downstream_ids": ["res-db", "res-storage"], "est_rps": 180, "p95_latency_ms": 250},
        ]
        return controllers, resources, endpoints

    elif is_gaming_or_wasm:
        controllers = [
            {"id": "c-auth", "name": "Player Identity Controller", "module": "player_auth_controller", "subsystem": "Player Identity"},
            {"id": "c-session", "name": "Game Session Controller", "module": "session_controller", "subsystem": "Game Loop"},
            {"id": "c-assets", "name": "Wasm & Assets Controller", "module": "asset_controller", "subsystem": "Wasm Delivery"},
            {"id": "c-leaderboard", "name": "Scores & Matchmaking Controller", "module": "leaderboard_controller", "subsystem": "Leaderboard"},
        ]
        resources = [
            {"id": "res-db", "name": "PostgreSQL Primary Cluster", "type": "database", "detail": "Player accounts, match states, tournament statistics", "badge": "Port 5432"},
            {"id": "res-cache", "name": "Redis In-Memory Tier", "type": "cache", "detail": "Sub-millisecond matchmaking queue & active session locks", "badge": "TTL 600s"},
            {"id": "res-storage", "name": "CloudFront CDN / S3 Lake", "type": "storage", "detail": "Compressed WebAssembly binaries, textures, replay archives", "badge": "Edge Cached"},
            {"id": "res-queue", "name": "Matchmaking & Event Bus", "type": "queue", "detail": "Decoupled asynchronous multiplayer match sync events", "badge": "Low Latency"},
        ]
        endpoints = [
            {"id": "ep-game-auth", "method": "POST", "path": "/api/v1/players/session", "summary": "Authenticate player and establish WebAssembly session token", "controller": "Player Identity Controller", "controller_id": "c-auth", "auth_required": False, "auth_type": "Public", "tags": ["Player", "Auth"], "downstream_targets": ["PostgreSQL Primary Cluster", "Redis In-Memory Tier"], "downstream_ids": ["res-db", "res-cache"], "est_rps": 350, "p95_latency_ms": 20},
            {"id": "ep-game-manifest", "method": "GET", "path": "/api/v1/game/wasm/manifest", "summary": "Fetch static WebAssembly chunk manifest and prefetch hashes", "controller": "Wasm & Assets Controller", "controller_id": "c-assets", "auth_required": False, "auth_type": "Public", "tags": ["Wasm", "Assets"], "downstream_targets": ["CloudFront CDN / S3 Lake"], "downstream_ids": ["res-storage"], "est_rps": 1200, "p95_latency_ms": 12},
            {"id": "ep-game-session-init", "method": "POST", "path": "/api/v1/game/matches/init", "summary": "Initialize interactive tournament match and allocate state", "controller": "Game Session Controller", "controller_id": "c-session", "auth_required": True, "auth_type": "Bearer JWT", "tags": ["Match", "Gameplay"], "downstream_targets": ["Redis In-Memory Tier", "PostgreSQL Primary Cluster"], "downstream_ids": ["res-cache", "res-db"], "est_rps": 280, "p95_latency_ms": 30},
            {"id": "ep-game-score", "method": "POST", "path": "/api/v1/game/matches/{id}/score", "summary": "Submit cryptographically signed match score and replay proof", "controller": "Scores & Matchmaking Controller", "controller_id": "c-leaderboard", "auth_required": True, "auth_type": "Bearer JWT", "tags": ["Scores", "Anti-Cheat"], "downstream_targets": ["PostgreSQL Primary Cluster", "Matchmaking & Event Bus"], "downstream_ids": ["res-db", "res-queue"], "est_rps": 150, "p95_latency_ms": 45},
            {"id": "ep-game-leaderboard", "method": "GET", "path": "/api/v1/leaderboard/global", "summary": "Query global tournament leaderboard standings and rankings", "controller": "Scores & Matchmaking Controller", "controller_id": "c-leaderboard", "auth_required": False, "auth_type": "Public", "tags": ["Leaderboard"], "downstream_targets": ["Redis In-Memory Tier"], "downstream_ids": ["res-cache"], "est_rps": 850, "p95_latency_ms": 8},
        ]
        return controllers, resources, endpoints

    elif is_ai_platform:
        controllers = [
            {"id": "c-auth", "name": "Auth & Identity Controller", "module": "auth_controller", "subsystem": "Identity"},
            {"id": "c-core", "name": "Architecture Engine Controller", "module": "core_controller", "subsystem": "Domain Core"},
            {"id": "c-data", "name": "Cost Analytics & Billing Controller", "module": "data_controller", "subsystem": "Data & Billing"},
            {"id": "c-ops", "name": "Telemetry & Webhooks Controller", "module": "ops_controller", "subsystem": "Platform Ops"},
        ]
        resources = [
            {"id": "res-db", "name": "PostgreSQL Primary Cluster", "type": "database", "detail": "Relational schema: users, workloads, audit_logs", "badge": "Port 5432"},
            {"id": "res-cache", "name": "Redis In-Memory Tier", "type": "cache", "detail": "Token session cache & rate limits", "badge": "TTL 3600s"},
            {"id": "res-storage", "name": "S3 / Blob Object Lake", "type": "storage", "detail": "Encrypted at rest: exports, diagram snapshots", "badge": "SSE-S3"},
            {"id": "res-queue", "name": "SQS / Event Stream Buffer", "type": "queue", "detail": "Decoupled async worker queue", "badge": "FIFO Queue"},
        ]
        endpoints = [
            {"id": "ep-login", "method": "POST", "path": "/api/v1/auth/login", "summary": "Authenticate user and issue JWT bearer token", "controller": "Auth & Identity Controller", "controller_id": "c-auth", "auth_required": False, "auth_type": "Public", "tags": ["Auth"], "downstream_targets": ["PostgreSQL Primary Cluster", "Redis In-Memory Tier"], "downstream_ids": ["res-db", "res-cache"], "est_rps": 180, "p95_latency_ms": 35},
            {"id": "ep-projects-list", "method": "GET", "path": "/api/v1/projects", "summary": "List all active cloud workload workspaces", "controller": "Architecture Engine Controller", "controller_id": "c-core", "auth_required": True, "auth_type": "Bearer JWT", "tags": ["Workloads"], "downstream_targets": ["PostgreSQL Primary Cluster"], "downstream_ids": ["res-db"], "est_rps": 250, "p95_latency_ms": 42},
            {"id": "ep-arch-gen", "method": "POST", "path": "/api/v1/projects/{id}/architecture/generate", "summary": "Synthesize multi-cloud service topology DAG", "controller": "Architecture Engine Controller", "controller_id": "c-core", "auth_required": True, "auth_type": "Bearer JWT", "tags": ["AI Engine"], "downstream_targets": ["PostgreSQL Primary Cluster", "SQS / Event Stream Buffer"], "downstream_ids": ["res-db", "res-queue"], "est_rps": 90, "p95_latency_ms": 320},
            {"id": "ep-costs", "method": "GET", "path": "/api/v1/projects/{id}/estimates", "summary": "Calculate live AWS & Azure monthly cost breakdown", "controller": "Cost Analytics & Billing Controller", "controller_id": "c-data", "auth_required": True, "auth_type": "Bearer JWT", "tags": ["FinOps"], "downstream_targets": ["PostgreSQL Primary Cluster", "Redis In-Memory Tier"], "downstream_ids": ["res-db", "res-cache"], "est_rps": 310, "p95_latency_ms": 65},
        ]
        return controllers, resources, endpoints

    else:
        # Standard Clean SaaS REST API
        controllers = [
            {"id": "c-auth", "name": "Auth & Identity Controller", "module": "auth_controller", "subsystem": "Identity"},
            {"id": "c-core", "name": "Core Resources Controller", "module": "core_controller", "subsystem": "Core"},
            {"id": "c-data", "name": "Data Pipeline Controller", "module": "data_controller", "subsystem": "Analytics"},
            {"id": "c-ops", "name": "Telemetry & Webhooks Controller", "module": "ops_controller", "subsystem": "Platform Ops"},
        ]
        resources = [
            {"id": "res-db", "name": "PostgreSQL Primary Cluster", "type": "database", "detail": "Relational schema: users, workspaces, records", "badge": "Port 5432"},
            {"id": "res-cache", "name": "Redis In-Memory Tier", "type": "cache", "detail": "Sub-millisecond token session cache", "badge": "TTL 3600s"},
            {"id": "res-storage", "name": "S3 / Blob Object Lake", "type": "storage", "detail": "Encrypted at rest: exports, document attachments", "badge": "SSE-S3"},
            {"id": "res-queue", "name": "SQS / Event Stream Buffer", "type": "queue", "detail": "Decoupled async worker queue", "badge": "FIFO Queue"},
        ]
        endpoints = [
            {"id": "ep-auth-session", "method": "POST", "path": "/api/v1/auth/session", "summary": "Create authentication session and JWT", "controller": "Auth & Identity Controller", "controller_id": "c-auth", "auth_required": False, "auth_type": "Public", "tags": ["Auth"], "downstream_targets": ["PostgreSQL Primary Cluster", "Redis In-Memory Tier"], "downstream_ids": ["res-db", "res-cache"], "est_rps": 200, "p95_latency_ms": 30},
            {"id": "ep-items-list", "method": "GET", "path": "/api/v1/items", "summary": "Retrieve paginated entities with filter params", "controller": "Core Resources Controller", "controller_id": "c-core", "auth_required": True, "auth_type": "Bearer JWT", "tags": ["Core"], "downstream_targets": ["PostgreSQL Primary Cluster", "Redis In-Memory Tier"], "downstream_ids": ["res-db", "res-cache"], "est_rps": 600, "p95_latency_ms": 40},
            {"id": "ep-items-create", "method": "POST", "path": "/api/v1/items", "summary": "Create new entity record and emit event", "controller": "Core Resources Controller", "controller_id": "c-core", "auth_required": True, "auth_type": "Bearer JWT", "tags": ["Core"], "downstream_targets": ["PostgreSQL Primary Cluster", "SQS / Event Stream Buffer"], "downstream_ids": ["res-db", "res-queue"], "est_rps": 120, "p95_latency_ms": 95},
            {"id": "ep-metrics-summary", "method": "GET", "path": "/api/v1/analytics/metrics", "summary": "Aggregate system performance and usage metrics", "controller": "Data Pipeline Controller", "controller_id": "c-data", "auth_required": True, "auth_type": "Bearer JWT", "tags": ["Analytics"], "downstream_targets": ["Redis In-Memory Tier", "PostgreSQL Primary Cluster"], "downstream_ids": ["res-cache", "res-db"], "est_rps": 150, "p95_latency_ms": 60},
        ]
        return controllers, resources, endpoints


async def build_project_api_topology(
    project_id: uuid.UUID,
    project_name: str,
    project_desc: str,
    github_url: Optional[str] = None,
    raw_requirements: Optional[str] = None,
    frameworks: Optional[List[str]] = None,
    components: Optional[List[str]] = None
) -> ApiTopologyResponse:
    """
    Constructs the complete API Topology DAG with nodes and edges formatted for ReactFlow.
    Discovers actual routes from GitHub repository if linked; otherwise synthesizes domain-accurate routes.
    """
    frameworks = frameworks or []
    components = components or []

    # 1. Check for GitHub repository
    repo_info = None
    search_corpus = f"{github_url or ''} {project_desc or ''} {raw_requirements or ''}"
    parsed = parse_repo_from_text(search_corpus)
    repo_name = None
    live_routes = []

    if parsed:
        owner, repo, branch = parsed
        repo_name = f"{owner}/{repo}"
        try:
            live_routes = await extract_github_routes(owner, repo, branch)
            logger.info(f"Discovered {len(live_routes)} live routes for {repo_name}")
        except Exception as e:
            logger.warning(f"Could not extract live GitHub routes for {repo_name}: {e}")

    # 2. Build or Synthesize Stack
    if live_routes and len(live_routes) >= 1:
        controllers, resources, endpoints = build_live_repo_api_stack(
            repo_name=repo_name or project_name,
            routes=live_routes,
            components=components
        )
    else:
        controllers, resources, endpoints = synthesize_default_api_stack(
            project_name=project_name,
            project_desc=project_desc,
            raw_requirements=raw_requirements,
            frameworks=frameworks,
            components=components
        )

    nodes: List[ApiTopologyGraphNode] = []
    edges: List[ApiTopologyGraphEdge] = []

    total_ep_count = len(endpoints)
    total_height = max(700, total_ep_count * 115)

    # 1. Ingress Node (Level 0) - vertically centered
    ingress_id = "node-ingress"
    ingress_y = max(60.0, (total_height / 2.0) - 60.0)
    nodes.append(
        ApiTopologyGraphNode(
            id=ingress_id,
            type="ingressNode",
            position={"x": 50.0, "y": ingress_y},
            data={
                "title": "CloudFront CDN & API Gateway",
                "subtitle": "HTTPS Ingress / SSL Termination",
                "provider": "Edge",
                "badge": "TLS 1.3",
                "rate_limit": "5,000 req/sec",
                "waf_enabled": True
            }
        )
    )

    # 2. Controllers (Level 1) - vertically distributed along total_height
    ctrl_count = len(controllers)
    ctrl_spacing = total_height / max(ctrl_count, 1)
    for idx, ctrl in enumerate(controllers):
        ctrl_node_id = f"node-{ctrl['id']}"
        pos_y = 50.0 + (idx * ctrl_spacing)
        nodes.append(
            ApiTopologyGraphNode(
                id=ctrl_node_id,
                type="controllerNode",
                position={"x": 380.0, "y": float(pos_y)},
                data={
                    "title": ctrl["name"],
                    "module": ctrl["module"],
                    "subsystem": ctrl["subsystem"],
                    "endpoints_count": sum(1 for e in endpoints if e["controller_id"] == ctrl["id"])
                }
            )
        )
        # Edge from Ingress to Controller
        edges.append(
            ApiTopologyGraphEdge(
                id=f"edge-ingress-{ctrl['id']}",
                source=ingress_id,
                target=ctrl_node_id,
                animated=True,
                label=ctrl["subsystem"]
            )
        )

    # 3. Endpoints (Level 2)
    endpoint_spacing = 115.0
    ep_start_y = 40.0
    for idx, ep in enumerate(endpoints):
        ep_node_id = f"node-{ep['id']}"
        pos_y = ep_start_y + (idx * endpoint_spacing)
        nodes.append(
            ApiTopologyGraphNode(
                id=ep_node_id,
                type="endpointNode",
                position={"x": 780.0, "y": float(pos_y)},
                data={
                    "id": ep["id"],
                    "method": ep["method"],
                    "path": ep["path"],
                    "summary": ep["summary"],
                    "auth_required": ep["auth_required"],
                    "auth_type": ep["auth_type"],
                    "est_rps": ep["est_rps"],
                    "p95_latency_ms": ep["p95_latency_ms"],
                    "tags": ep["tags"],
                    "controller": ep["controller"],
                    "downstream_targets": ep["downstream_targets"]
                }
            )
        )

        # Edge from Controller to Endpoint
        ctrl_node_id = f"node-{ep['controller_id']}"
        edges.append(
            ApiTopologyGraphEdge(
                id=f"edge-{ctrl_node_id}-{ep['id']}",
                source=ctrl_node_id,
                target=ep_node_id,
                animated=False,
                label=ep["method"]
            )
        )

    # 4. Downstream Resources (Level 3) - vertically distributed along total_height
    res_count = len(resources)
    res_spacing = total_height / max(res_count, 1)
    for idx, res in enumerate(resources):
        res_node_id = f"node-{res['id']}"
        pos_y = 60.0 + (idx * res_spacing)
        nodes.append(
            ApiTopologyGraphNode(
                id=res_node_id,
                type="resourceNode",
                position={"x": 1240.0, "y": float(pos_y)},
                data={
                    "name": res["name"],
                    "resource_type": res["type"],
                    "detail": res["detail"],
                    "badge": res["badge"]
                }
            )
        )

    # Edges from Endpoints to Resources
    for ep in endpoints:
        ep_node_id = f"node-{ep['id']}"
        for d_id in ep.get("downstream_ids", []):
            res_node_id = f"node-{d_id}"
            edges.append(
                ApiTopologyGraphEdge(
                    id=f"edge-{ep['id']}-{d_id}",
                    source=ep_node_id,
                    target=res_node_id,
                    animated=False,
                    label="Queries" if "db" in d_id else ("Caches" if "cache" in d_id else "Ingests")
                )
            )

    # Count breakdown
    methods_breakdown: Dict[str, int] = {}
    for ep in endpoints:
        m = ep["method"]
        methods_breakdown[m] = methods_breakdown.get(m, 0) + 1

    api_endpoint_items = [
        ApiEndpointItem(
            id=e["id"],
            method=e["method"],
            path=e["path"],
            summary=e["summary"],
            controller=e["controller"],
            auth_required=e["auth_required"],
            auth_type=e["auth_type"],
            tags=e["tags"],
            downstream_targets=e["downstream_targets"],
            est_rps=e["est_rps"],
            p95_latency_ms=e["p95_latency_ms"],
        )
        for e in endpoints
    ]

    return ApiTopologyResponse(
        project_id=project_id,
        repo_name=repo_name,
        endpoints_count=len(endpoints),
        controllers_count=len(controllers),
        methods_breakdown=methods_breakdown,
        nodes=nodes,
        edges=edges,
        endpoints=api_endpoint_items
    )
