"""按《FormWise-AI-功能测试案例》跑接口级功能测试。"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(ROOT, "backend"))
os.chdir(os.path.join(ROOT, "backend"))

BASE = os.environ.get("API_BASE", "http://127.0.0.1:8002")
results: list[dict] = []

SIMPLE_FLOW = {
    "nodes": [
        {"id": "start", "type": "start", "name": "发起"},
        {"id": "approve", "type": "approve", "name": "经理审批", "assigneeRole": "manager", "timeoutHours": 24},
        {"id": "end", "type": "end", "name": "结束"},
    ],
    "edges": [{"source": "start", "target": "approve"}, {"source": "approve", "target": "end"}],
}

SCHEMA = {
    "type": "object",
    "required": ["reason", "department"],
    "properties": {
        "reason": {"type": "string", "title": "事由", "component": "Input"},
        "department": {"type": "string", "title": "部门", "component": "Select"},
        "days": {"type": "number", "title": "天数", "component": "NumberInput"},
    },
}


def rec(cid: str, title: str, ok: bool, actual: str, expected: str = "", skip: bool = False):
    results.append(
        {
            "id": cid,
            "title": title,
            "result": "SKIP" if skip else ("PASS" if ok else "FAIL"),
            "actual": (actual or "")[:800],
            "expected": expected[:400],
        }
    )


def req(path: str, method="GET", token=None, body=None, timeout=60):
    data = None if body is None else json.dumps(body).encode()
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    r = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            raw = resp.read()
            ctype = (resp.headers.get("Content-Type") or "").lower()
            if "json" not in ctype and not raw[:1] in (b"{", b"["):
                return resp.status, {"_raw": f"bytes={len(raw)}", "_binary": True}, dict(resp.headers)
            try:
                payload = json.loads(raw.decode() or "{}")
            except (json.JSONDecodeError, UnicodeDecodeError):
                payload = {"_raw": f"bytes={len(raw)}", "_binary": True}
            return resp.status, payload, dict(resp.headers)
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            payload = json.loads(raw.decode() or "{}")
        except Exception:
            payload = {"message": raw.decode("utf-8", "ignore")[:300]}
        return e.code, payload, {}
    except Exception as e:
        return 0, {"message": str(e)}, {}


def login(email, password="Admin123!", slug="demo"):
    st, p, _ = req("/api/auth/login", "POST", body={"email": email, "password": password, "tenantSlug": slug})
    if st != 200 or not p.get("success"):
        raise RuntimeError(f"login {email} failed {st} {p}")
    return p["data"]


def write_report():
    passed = sum(1 for r in results if r["result"] == "PASS")
    failed = sum(1 for r in results if r["result"] == "FAIL")
    skipped = sum(1 for r in results if r["result"] == "SKIP")
    lines = [
        "# FormWise-AI 功能测试执行报告",
        "",
        f"- 时间：{datetime.now().isoformat(timespec='seconds')}",
        f"- API：{BASE}",
        f"- 合计：{len(results)}，通过 {passed}，失败 {failed}，跳过 {skipped}",
        "",
        "| 编号 | 结果 | 标题 | 实际 |",
        "|------|------|------|------|",
    ]
    for r in results:
        actual = r["actual"].replace("|", "/").replace("\n", " ")[:180]
        lines.append(f"| {r['id']} | **{r['result']}** | {r['title']} | {actual} |")
    fails = [r for r in results if r["result"] == "FAIL"]
    lines.append("")
    lines.append("## 失败明细")
    if not fails:
        lines.append("无。")
    else:
        for r in fails:
            lines.append(f"### {r['id']} {r['title']}")
            lines.append(f"- 期望：{r['expected']}")
            lines.append(f"- 实际：{r['actual']}")
            lines.append("")
    path = os.path.join(os.path.dirname(__file__), "测试执行报告.md")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    print(f"PASS={passed} FAIL={failed} SKIP={skipped} -> {path}")
    return failed


def main():
    st, p, _ = req("/health")
    rec("A01a", "GET /health", st == 200 and p.get("success") is not False and (p.get("success") or st == 200), str(p), "200")
    st, p, _ = req("/api/health")
    rec("A01b", "GET /api/health", st == 200 and p.get("success") is True, str(p), "success")

    st, p, _ = req("/api/auth/login", "POST", body={"email": "admin@formwise.local", "password": "Admin123!", "tenantSlug": "demo"})
    ok = st == 200 and bool((p.get("data") or {}).get("token"))
    rec("A02", "管理员邮箱登录", ok, f"{st} {p.get('message')} roles={(p.get('data') or {}).get('user', {}).get('roles')}", "JWT")
    if not ok:
        rec("ABORT", "无法登录管理员", False, str(p))
        write_report()
        return
    admin = p["data"]
    at = admin["token"]

    st, p, _ = req("/api/auth/login", "POST", body={"email": "admin", "password": "Admin123!", "tenantSlug": "demo"})
    rec("A03", "别名 admin 登录", st == 200 and bool((p.get("data") or {}).get("token")), f"{st} {p}")

    st, p, _ = req("/api/auth/login", "POST", body={"email": "admin", "password": "wrong12", "tenantSlug": "demo"})
    rec("A04a", "错误密码 401", st == 401, f"{st} {p.get('message')}")
    st, p, _ = req("/api/auth/login", "POST", body={"email": "admin", "password": "123", "tenantSlug": "demo"})
    rec("A04b", "短密码校验", st in (400, 422), f"{st} {p.get('message')}")

    st, p, _ = req("/api/auth/login", "POST", body={"email": "admin", "password": "Admin123!", "tenantSlug": "no-such"})
    rec("A05", "不存在租户 404", st == 404, f"{st} {p.get('message')}")

    st, p, _ = req("/api/auth/me")
    rec("A06a", "无 Token 401", st == 401, f"{st} {p.get('message')}")
    st, p, _ = req("/api/auth/me", token="bad.token.value")
    rec("A06b", "非法 Token 401", st == 401, f"{st} {p.get('message')}")

    st, p, _ = req("/api/auth/me", token=at)
    rec("A07", "me 含权限", st == 200 and "admin" in (p.get("data") or {}).get("roles", []), str(p.get("data")))

    email = f"case_{int(time.time())}@formwise.local"
    st, p, _ = req("/api/auth/register", "POST", body={"email": email, "password": "Admin123!", "name": "用例用户", "tenantSlug": "demo"})
    rec("A08a", "注册新用户", st in (200, 201) and p.get("success"), f"{st} {p.get('message')}")
    st, p, _ = req("/api/auth/register", "POST", body={"email": email, "password": "Admin123!", "name": "用例用户", "tenantSlug": "demo"})
    rec("A08b", "重复邮箱 409", st == 409, f"{st} {p.get('message')}")

    try:
        emp = login("employee@formwise.local")
        mgr = login("manager@formwise.local")
        rec("H01", "员工/经理邮箱登录", True, "ok")
    except Exception as e:
        rec("H01", "员工/经理邮箱登录", False, str(e))
        write_report()
        return
    et, mt = emp["token"], mgr["token"]

    st, p, _ = req("/api/forms", "POST", token=et, body={"name": "员工不应创建"})
    rec("B01", "员工不能创建表单", st == 403, f"{st} {p.get('message')}")

    st, p, _ = req("/api/workflows", token=mt)
    rec("B02a", "经理可读流程列表", st == 200, f"{st}")

    st, p, _ = req("/api/roles", token=at)
    rec("B04a", "管理员角色列表", st == 200 and p.get("success"), f"{st} n={len(p.get('data') or [])}")
    st, p, _ = req("/api/roles", token=et)
    rec("B04b", "员工角色列表无权限或只读", st in (200, 403), f"{st} {p.get('message')}")

    st, p, _ = req("/api/forms?page=1&pageSize=100", token=at)
    items = (p.get("data") or {}).get("items") if isinstance(p.get("data"), dict) else p.get("data")
    rec("C01", "表单分页列表", st == 200 and isinstance(items, list), f"{st} count={len(items) if isinstance(items, list) else type(p.get('data'))}")

    st, p, _ = req("/api/forms", "POST", token=at, body={"name": ""})
    rec("C02a", "空名称创建失败", st in (400, 422), f"{st} {p.get('message')}")

    fname = f"功能测试表单-{int(time.time())}"
    st, p, _ = req("/api/forms", "POST", token=at, body={"name": fname, "schemaJson": SCHEMA})
    form = (p.get("data") or {}) if st in (200, 201) else {}
    rec("C02b", "创建草稿表单", st in (200, 201) and form.get("id"), f"{st} {form.get('id')} {form.get('status')}")
    fid = form.get("id")

    if fid:
        st, p, _ = req(f"/api/forms/{fid}", token=at)
        schema = (p.get("data") or {}).get("schemaJson") or {}
        dept = (schema.get("properties") or {}).get("department") or {}
        opts = dept.get("options") or dept.get("enum") or (dept.get("x-component-props") or {}).get("options")
        rec("C06", "部门 Select 选项补全", bool(opts), f"opts={opts}")

        st, p, _ = req(f"/api/forms/{fid}/publish", "POST", token=at)
        rec("C03", "发布表单", st == 200 and (p.get("data") or {}).get("status") in ("published", "PUBLISHED", "Published"), f"{st} {p.get('data', {}).get('status')}")

        st, p, _ = req(f"/api/forms/{fid}/records", "POST", token=et, body={"dataJson": {"reason": "接口测试", "department": "rd", "days": 1}})
        rec("C04-pre", "未绑定流程也可提交（自动建流）", st in (200, 201), f"{st} {p.get('message')}")

    st, p, _ = req("/api/forms", "POST", token=at, body={"name": f"未发布-{int(time.time())}"})
    draft_id = (p.get("data") or {}).get("id")
    if draft_id:
        st, p, _ = req(f"/api/forms/{draft_id}/records", "POST", token=at, body={"dataJson": {"a": 1}})
        rec("C04", "未发布表单不可填报", st == 404, f"{st} {p.get('message')}")

    st, p, _ = req("/api/forms/ai-generate", "POST", token=at, body={"prompt": "加班申请，需要部门和加班类型下拉"})
    ai_ok = st in (200, 201) and ((p.get("data") or {}).get("form") or {}).get("id")
    rec("C05", "AI 生成表单", ai_ok, f"{st} {p.get('message')} id={((p.get('data') or {}).get('form') or {}).get('id')}")
    ai_form = ((p.get("data") or {}).get("form") or {}) if ai_ok else {}
    if ai_form.get("id"):
        props = (ai_form.get("schemaJson") or {}).get("properties") or {}
        has_opt = False
        for f in props.values():
            if not isinstance(f, dict):
                continue
            if f.get("options") or f.get("enum") or (f.get("x-component-props") or {}).get("options"):
                has_opt = True
                break
        rec("C05b", "AI 表单选择类有选项", has_opt or not props, f"keys={list(props)[:12]}")

    # D: 显式绑定流程 + 提交
    fname2 = f"绑定流程表单-{int(time.time())}"
    st, p, _ = req("/api/forms", "POST", token=at, body={"name": fname2, "schemaJson": SCHEMA})
    fid2 = (p.get("data") or {}).get("id")
    req(f"/api/forms/{fid2}/publish", "POST", token=at)
    st, p, _ = req("/api/workflows", "POST", token=at, body={"name": fname2 + "流程", "formId": fid2, "definitionJson": SIMPLE_FLOW})
    wfid = (p.get("data") or {}).get("id")
    rec("F01a", "创建工作流", bool(wfid), f"{st} {p.get('message')} {wfid}")
    if wfid:
        st, p, _ = req(f"/api/workflows/{wfid}/publish", "POST", token=at)
        rec("F01b", "发布工作流", st == 200, f"{st} {p.get('message')} {(p.get('data') or {}).get('status')}")

    st, p, _ = req(f"/api/forms/{fid2}/records", "POST", token=et, body={"dataJson": {"reason": "绑定流提交", "department": "hr", "days": 2}})
    rec_data = p.get("data") or {}
    inst = rec_data.get("instance")
    rec("D01", "提交已绑定流程产生实例", st in (200, 201) and rec_data.get("record") and inst, f"{st} {p.get('message')} inst={bool(inst)} tasks={len((inst or {}).get('tasks') or [])}")

    # D02 无绑定：用新表单
    fname3 = f"自动绑流-{int(time.time())}"
    st, p, _ = req("/api/forms", "POST", token=at, body={"name": fname3, "schemaJson": SCHEMA})
    fid3 = (p.get("data") or {}).get("id")
    req(f"/api/forms/{fid3}/publish", "POST", token=at)
    st, p, _ = req(f"/api/forms/{fid3}/records", "POST", token=et, body={"dataJson": {"reason": "自动流", "department": "finance", "days": 1}})
    inst3 = (p.get("data") or {}).get("instance")
    rec("D02", "无绑定流程自动创建并启动", st in (200, 201) and inst3, f"{st} {p.get('message')} inst={bool(inst3)}")

    st, p, _ = req(f"/api/forms/{fid2}/records?page=1&pageSize=20", token=at)
    d = p.get("data") or {}
    rec("D05", "记录列表按表单", st == 200 and isinstance(d.get("items"), list), f"{st} total={d.get('total')}")

    st, p, hdr = req(f"/api/forms/{fid2}/records/export", token=at)
    rec("D07", "导出 Excel", st == 200 and (p.get("_binary") or "spreadsheet" in str(hdr.get("Content-Type", "")).lower()), f"{st} ct={hdr.get('Content-Type')} {p}")

    # E 待办
    st, p, _ = req("/api/tasks/todo", token=mt)
    todos_m = p.get("data") if isinstance(p.get("data"), list) else (p.get("data") or {}).get("items") or []
    rec("E01", "经理待办非空或可查询", st == 200 and isinstance(todos_m, list), f"{st} n={len(todos_m)}")

    st, p, _ = req("/api/tasks/todo", token=at)
    todos_a = p.get("data") if isinstance(p.get("data"), list) else []
    rec("E02", "管理员可见租户待办", st == 200 and isinstance(todos_a, list) and (len(todos_a) >= len(todos_m) or len(todos_a) > 0), f"{st} admin={len(todos_a)} mgr={len(todos_m)}")

    st, p, _ = req("/api/tasks/todo", token=et)
    todos_e = p.get("data") if isinstance(p.get("data"), list) else []
    emp_ids = {t.get("id") for t in todos_e}
    mgr_only = [t for t in todos_m if t.get("id") not in emp_ids]
    rec("E01b", "员工看不到经理待办（若指派经理）", True if not todos_m else all(t.get("id") not in emp_ids for t in todos_m), f"emp={len(todos_e)} mgr_only={len(mgr_only)}")

    # 经理通过一条
    task = next((t for t in todos_m if t.get("status") in ("pending", "PENDING", "timeout", "TIMEOUT")), None)
    if not task and todos_a:
        task = next((t for t in todos_a if t.get("status") in ("pending", "PENDING", "timeout", "TIMEOUT")), None)
        use_token = at
    else:
        use_token = mt
    if task:
        st, p, _ = req(f"/api/tasks/{task['id']}/approve", "POST", token=use_token, body={"comment": "同意-用例"})
        rec("E03", "审批通过", st == 200 and p.get("success"), f"{st} {p.get('message')} status={(p.get('data') or {}).get('status')}")
        st, p, _ = req(f"/api/tasks/{task['id']}/approve", "POST", token=use_token, body={"comment": "再同意"})
        rec("E03b", "重复审批 400", st == 400, f"{st} {p.get('message')}")
    else:
        rec("E03", "审批通过", False, "没有待办任务", skip=False)

    # 新实例驳回
    st, p, _ = req(f"/api/forms/{fid2}/records", "POST", token=et, body={"dataJson": {"reason": "待驳回", "department": "rd", "days": 3}})
    reject_rec = (p.get("data") or {}).get("record") or {}
    inst_r = (p.get("data") or {}).get("instance") or {}
    rtasks = inst_r.get("tasks") or []
    rt = next((t for t in rtasks if t.get("status") in ("pending", "PENDING")), None)
    if rt:
        st, p, _ = req(f"/api/tasks/{rt['id']}/reject", "POST", token=at, body={"comment": "资料不全"})
        rec("E04", "管理员代为驳回", st == 200, f"{st} {p.get('message')} {(p.get('data') or {}).get('status')}")
        rec("E05", "驳回后实例结束", (p.get("data") or {}).get("status") in ("rejected", "REJECTED"), str((p.get("data") or {}).get("status")))
        if reject_rec.get("id"):
            st, p, _ = req(f"/api/records/{reject_rec['id']}/retry", "POST", token=et, body={"dataJson": {"reason": "补齐资料", "department": "rd", "days": 3}})
            rec("E06", "驳回重提", st in (200, 201) and (p.get("data") or {}).get("id") or (p.get("data") or {}).get("status"), f"{st} {p.get('message')} keys={list((p.get('data') or {}).keys())}")
            st, p, _ = req(f"/api/records/{reject_rec['id']}/retry", "POST", token=mt, body={"dataJson": {"reason": "经理重提"}})
            rec("E06b", "非发起人重提失败", st in (403, 404, 400), f"{st} {p.get('message')}")
    else:
        rec("E04", "管理员代为驳回", False, f"无任务 instance={bool(inst_r)} {p}")

    st, p, _ = req("/api/tasks/done", token=use_token if task else mt)
    rec("E08", "已办列表", st == 200 and isinstance(p.get("data"), list), f"{st} n={len(p.get('data') or [])}")

    # 删除测试流程（F03）— 另建一条再删
    st, p, _ = req("/api/workflows", "POST", token=at, body={"name": f"待删除流程-{int(time.time())}", "definitionJson": SIMPLE_FLOW})
    del_id = (p.get("data") or {}).get("id")
    st, p, _ = req(f"/api/workflows/{del_id}", "DELETE", token=mt)
    rec("B02b", "经理不能删除流程", st == 403, f"{st} {p.get('message')}")
    st, p, _ = req(f"/api/workflows/{del_id}", "DELETE", token=at)
    rec("F03a", "管理员删除流程", st == 200, f"{st} {p.get('message')}")
    st, p, _ = req(f"/api/workflows/{del_id}", token=at)
    rec("F03b", "删除后 GET 404", st == 404, f"{st} {p.get('message')}")

    st, p, _ = req("/api/notifications", token=mt)
    rec("G01", "经理消息列表可查", st == 200 and isinstance(p.get("data"), list), f"{st} n={len(p.get('data') or [])}")
    notes = p.get("data") or []
    if notes:
        nid = notes[0].get("id")
        st, p, _ = req(f"/api/notifications/{nid}/read", "PATCH", token=mt)
        rec("G02a", "单条已读", st == 200, f"{st}")
    st, p, _ = req("/api/notifications/read-all", "POST", token=mt)
    rec("G02b", "全部已读", st == 200, f"{st} {p}")

    st, p, _ = req("/api/plugins", token=at)
    rec("G03", "插件列表", st == 200, f"{st} n={len(p.get('data') or [])}")

    st, p, _ = req("/api/users", token=at)
    rec("B03a", "用户列表", st == 200, f"{st} {type(p.get('data'))}")

    # 记录删除
    if fid2:
        st, p, _ = req(f"/api/forms/{fid2}/records", "POST", token=at, body={"dataJson": {"reason": "待删", "department": "admin"}})
        rid = ((p.get("data") or {}).get("record") or {}).get("id")
        if rid:
            st, p, _ = req(f"/api/records/{rid}", "DELETE", token=at)
            rec("D08", "删除记录", st == 200, f"{st} {p.get('message')}")
            st, p, _ = req(f"/api/records/{rid}", token=at)
            rec("D08b", "删除后 404", st == 404, f"{st} {p.get('message')}")

    write_report()


if __name__ == "__main__":
    main()
    failed = sum(1 for r in results if r["result"] == "FAIL")
    sys.exit(1 if failed else 0)
