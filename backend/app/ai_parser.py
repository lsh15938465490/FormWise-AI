from __future__ import annotations

import json
import urllib.error
import urllib.request
from copy import deepcopy

from app.config import get_settings

DEPT_OPTIONS = [
    {"label": "人事部", "value": "hr"},
    {"label": "财务部", "value": "finance"},
    {"label": "研发部", "value": "rd"},
    {"label": "行政部", "value": "admin"},
]

POSITION_MAP = {
    "hr": [{"label": "人事专员", "value": "hr-specialist"}, {"label": "人事经理", "value": "hr-manager"}],
    "finance": [{"label": "会计", "value": "accountant"}, {"label": "财务经理", "value": "finance-manager"}],
    "rd": [{"label": "工程师", "value": "engineer"}, {"label": "研发经理", "value": "rd-manager"}],
    "admin": [{"label": "行政专员", "value": "admin-specialist"}, {"label": "行政经理", "value": "admin-manager"}],
}

FIELD_ALIASES = [
    {"keywords": ["姓名", "员工姓名"], "field": {"name": "name", "label": "姓名", "type": "string", "component": "Input", "required": True, "group": "basic"}},
    {"keywords": ["部门"], "field": {"name": "department", "label": "部门", "type": "string", "component": "Select", "required": True, "group": "basic", "options": DEPT_OPTIONS}},
    {"keywords": ["岗位", "职位"], "field": {"name": "position", "label": "岗位", "type": "string", "component": "Select", "required": True, "group": "basic", "options": [{"label": "专员", "value": "specialist"}, {"label": "主管", "value": "supervisor"}, {"label": "经理", "value": "manager"}]}},
    {"keywords": ["请假类型"], "field": {"name": "leaveType", "label": "请假类型", "type": "string", "component": "Select", "required": True, "group": "business", "options": [
        {"label": "年假", "value": "annual"}, {"label": "事假", "value": "personal"}, {"label": "病假", "value": "sick"},
    ]}},
    {"keywords": ["请假时长", "时长"], "field": {"name": "duration", "label": "请假时长", "type": "number", "component": "NumberInput", "required": True, "group": "business", "validations": {"min": 0}}},
    {"keywords": ["请假原因", "原因", "事由"], "field": {"name": "reason", "label": "事由", "type": "string", "component": "Textarea", "required": True, "group": "remark"}},
    {"keywords": ["金额", "费用"], "field": {"name": "amount", "label": "金额", "type": "number", "component": "NumberInput", "required": True, "group": "business", "validations": {"min": 0}}},
    {"keywords": ["开始日期", "开始时间"], "field": {"name": "startDate", "label": "开始日期", "type": "string", "component": "DatePicker", "required": True, "group": "business"}},
    {"keywords": ["结束日期", "结束时间"], "field": {"name": "endDate", "label": "结束日期", "type": "string", "component": "DatePicker", "required": True, "group": "business"}},
    {"keywords": ["手机", "电话"], "field": {"name": "phone", "label": "手机号", "type": "string", "component": "Input", "required": True, "group": "basic", "validations": {"pattern": r"^1\d{10}$"}}},
    {"keywords": ["加班类型"], "field": {"name": "overtimeType", "label": "加班类型", "type": "string", "component": "Select", "required": True, "group": "business", "options": [
        {"label": "工作日加班", "value": "weekday"}, {"label": "周末加班", "value": "weekend"}, {"label": "节假日加班", "value": "holiday"},
    ]}},
    {"keywords": ["明细", "费用明细", "子表"], "field": {"name": "items", "label": "明细", "type": "array", "component": "SubForm", "required": False, "group": "business", "itemFields": [
        {"name": "content", "title": "内容", "type": "string", "component": "Input"},
        {"name": "amount", "title": "金额", "type": "number", "component": "NumberInput"},
    ]}},
]


def _infer_name(prompt: str) -> str:
    if "请假" in prompt:
        return "员工请假审批表"
    if "报销" in prompt:
        return "费用报销申请表"
    if "采购" in prompt:
        return "物资采购申请表"
    if "加班" in prompt:
        return "加班申请表"
    if "出差" in prompt:
        return "出差审批表"
    return "业务登记表"


def _match_fields(prompt: str) -> list[dict]:
    matched = []
    for item in FIELD_ALIASES:
        if any(k in prompt for k in item["keywords"]):
            field = deepcopy(item["field"])
            field["placeholder"] = f"请输入{field['label']}"
            matched.append(field)
    return matched


def _recommend_layout(fields: list[dict]) -> tuple[list[dict], str]:
    names = {f["name"] for f in fields}
    groups = [
        {"key": "basic", "title": "基础信息", "fields": [f["name"] for f in fields if f.get("group") == "basic"]},
        {"key": "business", "title": "业务信息", "fields": [f["name"] for f in fields if f.get("group") == "business"]},
        {"key": "remark", "title": "备注信息", "fields": [f["name"] for f in fields if f.get("group") == "remark"]},
    ]
    groups = [g for g in groups if g["fields"]]
    tips = []
    if {"department", "position"} <= names:
        tips.append("已将「部门」「岗位」放在基础信息并排，部门变更会刷新岗位选项")
    if "amount" in names:
        tips.append("金额类字段放在业务信息区，便于和日期、明细一起填写")
    if "items" in names:
        tips.append("检测到明细需求，已加入可增行的子表单")
    return groups, "；".join(tips) if tips else "已按基础 / 业务 / 备注自动分组"


def _linkage_for(fields: list[dict]) -> dict:
    names = {f["name"] for f in fields}
    rules = []
    if {"department", "position"} <= names:
        rules.append({"source": "department", "target": "position", "type": "filter-options", "optionMap": POSITION_MAP})
    return {"rules": rules}


def _pack(name: str, prompt: str, fields: list[dict]) -> dict:
    if not fields:
        fields = [
            {"name": "title", "label": "标题", "type": "string", "component": "Input", "required": True, "group": "basic", "placeholder": "请输入标题"},
            {"name": "content", "label": "内容", "type": "string", "component": "Textarea", "required": True, "group": "business", "placeholder": "请输入内容"},
        ]
    properties = {}
    required = []
    for field in fields:
        properties[field["name"]] = {
            "type": field["type"],
            "title": field.get("label") or field.get("title"),
            "component": field["component"],
            "placeholder": field.get("placeholder"),
            "options": field.get("options"),
            "validations": field.get("validations"),
            "itemFields": field.get("itemFields"),
        }
        if field.get("required"):
            required.append(field["name"])
    groups, layout_tip = _recommend_layout(fields)
    return {
        "name": name,
        "description": f"由自然语言生成：{prompt[:80]}",
        "schemaJson": {"type": "object", "properties": properties, "required": required},
        "dataModelJson": {"fields": [{"name": f["name"], "type": f["type"], "required": bool(f.get("required"))} for f in fields]},
        "linkageJson": _linkage_for(fields),
        "layoutJson": {"groups": groups, "tip": layout_tip},
        "fields": fields,
        "layoutTip": layout_tip,
    }


def _try_llm(prompt: str, current: dict | None) -> dict | None:
    settings = get_settings()
    if settings.AI_PROVIDER == "mock" or not settings.OPENAI_API_KEY:
        return None
    body = {
        "model": settings.OPENAI_MODEL,
        "messages": [
            {
                "role": "system",
                "content": "你是表单配置助手。只返回 JSON：name, fields[{name,label,type,component,required,group,options,validations,itemFields}]。"
                "component 只能是 Input/Select/Textarea/NumberInput/DatePicker/Upload/Radio/Checkbox/SubForm。"
                "group 只能是 basic/business/remark。",
            },
            {"role": "user", "content": json.dumps({"prompt": prompt, "current": current}, ensure_ascii=False)[:8000]},
        ],
        "temperature": 0.2,
    }
    req = urllib.request.Request(
        f"{settings.OPENAI_BASE_URL.rstrip('/')}/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {settings.OPENAI_API_KEY}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        text = payload["choices"][0]["message"]["content"]
        start, end = text.find("{"), text.rfind("}")
        data = json.loads(text[start : end + 1])
        fields = data.get("fields") or []
        if not fields:
            return None
        return _pack(data.get("name") or _infer_name(prompt), prompt, fields)
    except (urllib.error.URLError, KeyError, json.JSONDecodeError, TimeoutError, ValueError):
        return None


def parse_prompt_to_form(prompt: str, current: dict | None = None) -> dict:
    llm = _try_llm(prompt, current)
    if llm:
        return llm
    if current:
        return refine_form(current, prompt)
    return _pack(_infer_name(prompt), prompt, _match_fields(prompt))


def refine_form(current: dict, prompt: str) -> dict:
    props = ((current.get("schemaJson") or current).get("properties")) if isinstance(current, dict) else {}
    if not props and current.get("properties"):
        props = current["properties"]
    schema = current.get("schemaJson") or current
    required = list(schema.get("required") or [])
    layout = current.get("layoutJson") or {}
    group_of = {}
    for g in layout.get("groups") or []:
        for n in g.get("fields") or []:
            group_of[n] = g.get("key", "basic")
    fields = []
    for name, raw in (props or {}).items():
        fields.append(
            {
                "name": name,
                "label": raw.get("title") or name,
                "type": raw.get("type") or "string",
                "component": raw.get("component") or "Input",
                "required": name in required,
                "group": group_of.get(name, "basic"),
                "options": raw.get("options"),
                "validations": raw.get("validations"),
                "itemFields": raw.get("itemFields"),
                "placeholder": raw.get("placeholder"),
            }
        )
    extra = _match_fields(prompt)
    by_name = {f["name"]: f for f in fields}
    for f in extra:
        if f["name"] not in by_name:
            by_name[f["name"]] = f
            fields.append(f)
    kept = []
    for f in fields:
        title = f.get("label") or f["name"]
        if any(p in prompt for p in (f"删除{title}", f"去掉{title}", f"移除{title}")):
            continue
        if f"必填{title}" in prompt or f"{title}必填" in prompt:
            f["required"] = True
        kept.append(f)
    name = current.get("name") or _infer_name(prompt)
    return _pack(name, prompt, kept)
