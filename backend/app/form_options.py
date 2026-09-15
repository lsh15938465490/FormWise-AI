"""下拉 / 单选 / 多选缺选项时补全，生成、套模板、读表单都走这里。"""

from __future__ import annotations

from copy import deepcopy

CHOICE_COMPONENTS = {"Select", "Radio", "Checkbox"}

DEPT_OPTIONS = [
    {"label": "人事部", "value": "hr"},
    {"label": "财务部", "value": "finance"},
    {"label": "研发部", "value": "rd"},
    {"label": "行政部", "value": "admin"},
]

LEAVE_TYPE_OPTIONS = [
    {"label": "年假", "value": "annual"},
    {"label": "事假", "value": "personal"},
    {"label": "病假", "value": "sick"},
    {"label": "调休", "value": "compensatory"},
]

OVERTIME_OPTIONS = [
    {"label": "工作日加班", "value": "weekday"},
    {"label": "周末加班", "value": "weekend"},
    {"label": "节假日加班", "value": "holiday"},
]

POSITION_OPTIONS = [
    {"label": "专员", "value": "specialist"},
    {"label": "主管", "value": "supervisor"},
    {"label": "经理", "value": "manager"},
]

YES_NO_OPTIONS = [
    {"label": "是", "value": "yes"},
    {"label": "否", "value": "no"},
]

GENERIC_OPTIONS = [
    {"label": "选项一", "value": "opt1"},
    {"label": "选项二", "value": "opt2"},
    {"label": "选项三", "value": "opt3"},
]

OPTIONS_BY_NAME = {
    "department": DEPT_OPTIONS,
    "dept": DEPT_OPTIONS,
    "leaveType": LEAVE_TYPE_OPTIONS,
    "leavetype": LEAVE_TYPE_OPTIONS,
    "overtimeType": OVERTIME_OPTIONS,
    "overtimetype": OVERTIME_OPTIONS,
    "position": POSITION_OPTIONS,
    "gender": [{"label": "男", "value": "male"}, {"label": "女", "value": "female"}],
    "urgency": [
        {"label": "普通", "value": "normal"},
        {"label": "紧急", "value": "urgent"},
        {"label": "特急", "value": "critical"},
    ],
}

OPTIONS_BY_KEYWORD = [
    ("部门", DEPT_OPTIONS),
    ("请假类型", LEAVE_TYPE_OPTIONS),
    ("加班类型", OVERTIME_OPTIONS),
    ("岗位", POSITION_OPTIONS),
    ("职位", POSITION_OPTIONS),
    ("性别", OPTIONS_BY_NAME["gender"]),
    ("紧急", OPTIONS_BY_NAME["urgency"]),
    ("是否", YES_NO_OPTIONS),
]


def _clean_options(raw) -> list[dict]:
    items = []
    if not raw:
        return items
    if isinstance(raw, list):
        for o in raw:
            if isinstance(o, dict):
                label = str(o.get("label") or o.get("value") or "").strip()
                value = str(o.get("value") or o.get("label") or "").strip()
                if label or value:
                    items.append({"label": label or value, "value": value or label})
            elif o is not None and str(o).strip():
                s = str(o).strip()
                items.append({"label": s, "value": s})
    return items


def resolve_options(name: str, title: str, component: str, options=None, enum=None) -> list[dict]:
    if component not in CHOICE_COMPONENTS:
        return _clean_options(options)
    existing = _clean_options(options) or _clean_options(enum)
    if existing:
        return existing
    key = (name or "").strip()
    found = OPTIONS_BY_NAME.get(key) or OPTIONS_BY_NAME.get(key.lower())
    if found:
        return deepcopy(found)
    text = f"{title or ''}{name or ''}"
    for kw, opts in OPTIONS_BY_KEYWORD:
        if kw in text:
            return deepcopy(opts)
    return deepcopy(GENERIC_OPTIONS)


def fill_schema_options(schema: dict | None) -> dict:
    data = deepcopy(schema) if isinstance(schema, dict) else {"type": "object", "properties": {}, "required": []}
    props = data.get("properties")
    if not isinstance(props, dict):
        return data
    for name, raw in props.items():
        if not isinstance(raw, dict):
            continue
        component = str(raw.get("component") or raw.get("x-component") or "Input")
        if component not in CHOICE_COMPONENTS:
            continue
        raw["component"] = component
        raw["options"] = resolve_options(name, str(raw.get("title") or name), component, raw.get("options"), raw.get("enum"))
    return data
