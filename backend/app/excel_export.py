from __future__ import annotations

import io
import re
import zipfile
from xml.sax.saxutils import escape


def _cell(ref: str, value: str) -> str:
    return f'<c r="{ref}" t="inlineStr"><is><t>{escape(str(value)[:32000])}</t></is></c>'


def _col_letter(idx: int) -> str:
    n = idx
    letters = ""
    while n:
        n, rem = divmod(n - 1, 26)
        letters = chr(65 + rem) + letters
    return letters or "A"


def records_to_xlsx(headers: list[str], rows: list[list[str]]) -> bytes:
    sheet_rows = []
    for r_i, row in enumerate([headers, *rows], start=1):
        cells = "".join(_cell(f"{_col_letter(c_i)}{r_i}", v) for c_i, v in enumerate(row, start=1))
        sheet_rows.append(f'<row r="{r_i}">{cells}</row>')
    sheet = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        f"<sheetData>{''.join(sheet_rows)}</sheetData></worksheet>"
    )
    workbook = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        '<sheets><sheet name="records" sheetId="1" r:id="rId1"/></sheets></workbook>'
    )
    rels = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        "</Relationships>"
    )
    wb_rels = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
        "</Relationships>"
    )
    ctypes = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        "</Types>"
    )
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", ctypes)
        zf.writestr("_rels/.rels", rels)
        zf.writestr("xl/workbook.xml", workbook)
        zf.writestr("xl/_rels/workbook.xml.rels", wb_rels)
        zf.writestr("xl/worksheets/sheet1.xml", sheet)
    return buf.getvalue()


_COND = re.compile(r"^([A-Za-z_][\w]*)\s*(==|!=|>=|<=|>|<)\s*(.+)$")


def edge_matches(condition: str | None, data: dict) -> bool:
    if not condition or not str(condition).strip():
        return True
    m = _COND.match(str(condition).strip())
    if not m:
        return True
    field, op, raw = m.group(1), m.group(2), m.group(3).strip().strip("'\"")
    left = data.get(field)
    try:
        right: object = float(raw) if re.fullmatch(r"-?\d+(\.\d+)?", raw) else raw
        left_n = float(left) if left is not None and str(left) != "" and not isinstance(left, bool) else left
        if op in {">", "<", ">=", "<="} and left_n is not None:
            left = float(left_n)
            right = float(right)
    except (TypeError, ValueError):
        right = raw
    if op == "==":
        return str(left) == str(right)
    if op == "!=":
        return str(left) != str(right)
    if left is None:
        return False
    try:
        if op == ">":
            return left > right
        if op == "<":
            return left < right
        if op == ">=":
            return left >= right
        if op == "<=":
            return left <= right
    except TypeError:
        return False
    return True
