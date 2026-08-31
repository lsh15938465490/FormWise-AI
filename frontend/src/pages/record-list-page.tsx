import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { SchemaForm } from "@/components/form-engine/schema-form";
import { formApi, recordApi } from "@/lib/api";
import { fieldsFromForm } from "@/lib/form-schema";
import { usePermission } from "@/hooks/use-permission";
import type { FormEntity } from "@/types/api";

type Row = { id: string; status: string; dataJson: Record<string, unknown>; creator?: { name: string } };

export function RecordListPage() {
  const { can } = usePermission();
  const [forms, setForms] = useState<FormEntity[]>([]);
  const [formId, setFormId] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("createdAt");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Row | null>(null);
  const [creating, setCreating] = useState(false);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);

  const form = forms.find((f) => f.id === formId);
  const fieldNames = form ? fieldsFromForm(form.schemaJson, form.layoutJson).map((f) => f.name) : [];

  async function load(fid = formId, p = page, st = status, kw = keyword, s = sort, o = order) {
    if (!fid) return;
    const res = await recordApi.list(fid, p, st, { keyword: kw, sort: s, order: o });
    setRows(res.items as Row[]);
    setTotal(res.total);
  }

  useEffect(() => {
    formApi
      .list()
      .then((res) => {
        setForms(res.items);
        const first = res.items.find((f) => f.status === "PUBLISHED") ?? res.items[0];
        if (first) setFormId(first.id);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    load(formId, 1, status, keyword, sort, order).catch((err: Error) => setError(err.message));
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formId, status, sort, order]);

  function toggleSort(field: string) {
    if (sort === field) setOrder(order === "asc" ? "desc" : "asc");
    else {
      setSort(field);
      setOrder("asc");
    }
  }

  async function importCsv(file: File) {
    const text = await file.text();
    const [head, ...body] = text.trim().split(/\r?\n/);
    const cols = head.split(",");
    for (const line of body) {
      const cells = line.split(",");
      const dataJson: Record<string, unknown> = {};
      cols.forEach((c, i) => {
        if (c !== "id" && c !== "status") dataJson[c] = cells[i]?.replace(/^"|"$/g, "");
      });
      await recordApi.create(formId, dataJson);
    }
    await load();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-2xl font-semibold">动态数据列表</h1>
        {can("record:write") ? <Button onClick={() => setCreating(true)}>新增</Button> : null}
        {can("record:read") ? (
          <Button variant="outline" onClick={() => recordApi.exportExcel(formId)}>
            导出 Excel
          </Button>
        ) : null}
        {can("record:write") ? (
          <label className="text-sm">
            导入
            <input
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importCsv(f);
              }}
            />
          </label>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <Select value={formId} onChange={(e) => setFormId(e.target.value)}>
          {forms.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </Select>
        <Input
          placeholder="关键词"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onBlur={() => load(formId, 1, status, keyword, sort, order)}
          className="w-48"
        />
        <Select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">全部状态</option>
          <option value="submitted">submitted</option>
          <option value="archived">archived</option>
          <option value="rejected">rejected</option>
        </Select>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Card className="overflow-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left">
            <tr>
              <th className="px-3 py-2">ID</th>
              <th className="px-3 py-2 cursor-pointer" onClick={() => toggleSort("status")}>
                状态 {sort === "status" ? (order === "asc" ? "↑" : "↓") : ""}
              </th>
              {fieldNames.slice(0, 4).map((n) => (
                <th key={n} className="px-3 py-2 cursor-pointer" onClick={() => toggleSort(n)}>
                  {n} {sort === n ? (order === "asc" ? "↑" : "↓") : ""}
                </th>
              ))}
              <th className="px-3 py-2">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t">
                <td className="px-3 py-2 font-mono text-xs">{row.id.slice(-8)}</td>
                <td className="px-3 py-2">{row.status}</td>
                {fieldNames.slice(0, 4).map((n) => (
                  <td key={n} className="px-3 py-2">
                    {String(row.dataJson?.[n] ?? "")}
                  </td>
                ))}
                <td className="space-x-2 px-3 py-2">
                  <button className="text-primary" onClick={async () => setDetail(await recordApi.get(row.id))}>
                    详情
                  </button>
                  {can("record:write") ? (
                    <button className="text-primary" onClick={() => setEditing(row)}>
                      编辑
                    </button>
                  ) : null}
                  {can("record:write") && row.status === "rejected" ? (
                    <button
                      className="text-primary"
                      onClick={async () => {
                        await recordApi.retry(row.id, row.dataJson);
                        await load();
                      }}
                    >
                      重提
                    </button>
                  ) : null}
                  {can("record:write") ? (
                    <button
                      className="text-destructive"
                      onClick={async () => {
                        await recordApi.remove(row.id);
                        await load();
                      }}
                    >
                      删除
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <div className="flex gap-2 text-sm">
        <span>共 {total} 条</span>
        <Button variant="outline" disabled={page <= 1} onClick={() => { const p = page - 1; setPage(p); load(formId, p); }}>
          上一页
        </Button>
        <Button
          variant="outline"
          disabled={page * 20 >= total}
          onClick={() => {
            const p = page + 1;
            setPage(p);
            load(formId, p);
          }}
        >
          下一页
        </Button>
      </div>
      {form && creating ? (
        <Modal open title="新增记录" onClose={() => setCreating(false)}>
          <SchemaForm
            schemaJson={form.schemaJson}
            layoutJson={form.layoutJson}
            linkageJson={form.linkageJson}
            onSubmit={async (values) => {
              await recordApi.create(form.id, values);
              setCreating(false);
              await load();
            }}
          />
        </Modal>
      ) : null}
      {form && editing ? (
        <Modal open title="编辑记录" onClose={() => setEditing(null)}>
          <SchemaForm
            key={editing.id}
            schemaJson={form.schemaJson}
            layoutJson={form.layoutJson}
            linkageJson={form.linkageJson}
            defaultValues={editing.dataJson}
            submitText="保存"
            onSubmit={async (values) => {
              await recordApi.update(editing.id, values);
              setEditing(null);
              await load();
            }}
          />
        </Modal>
      ) : null}
      {detail ? (
        <Modal open title="记录详情 / 流程溯源" onClose={() => setDetail(null)}>
          <pre className="max-h-96 overflow-auto rounded bg-muted p-3 text-xs">{JSON.stringify(detail, null, 2)}</pre>
        </Modal>
      ) : null}
    </div>
  );
}
