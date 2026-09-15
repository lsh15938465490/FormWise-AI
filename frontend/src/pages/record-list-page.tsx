import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { SchemaForm } from "@/components/form-engine/schema-form";
import { formApi, recordApi } from "@/lib/api";
import { fieldsFromForm, displayFieldValue } from "@/lib/form-schema";
import { usePermission } from "@/hooks/use-permission";
import type { FormEntity } from "@/types/api";
import { FLOW_ACTION, INSTANCE_STATUS, RECORD_STATUS, TASK_STATUS, labelOf } from "@/lib/labels";

type Row = { id: string; status: string; dataJson: Record<string, unknown>; creator?: { name: string } };

const FORM_ID_KEY = "formwise.records.formId";

function formOptionLabel(form: FormEntity, all: FormEntity[]) {
  const dup = all.filter((f) => f.name === form.name).length > 1;
  if (!dup) return form.name;
  const when = form.updatedAt ? new Date(form.updatedAt).toLocaleString() : form.id.slice(-6);
  return `${form.name} · ${when}`;
}

export function RecordListPage() {
  const { can } = usePermission();
  const [forms, setForms] = useState<FormEntity[]>([]);
  const [formId, setFormId] = useState("");
  const [notice, setNotice] = useState("");
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
  const fields = form ? fieldsFromForm(form.schemaJson, form.layoutJson) : [];

  async function load(fid = formId, p = page, st = status, kw = keyword, s = sort, o = order) {
    if (!fid) return;
    const res = await recordApi.list(fid, p, st, { keyword: kw, sort: s, order: o });
    setRows(res.items as Row[]);
    setTotal(res.total);
  }

  useEffect(() => {
    formApi
      .list(1)
      .then((res) => {
        setForms(res.items);
        const saved = sessionStorage.getItem(FORM_ID_KEY);
        const savedForm = saved ? res.items.find((f) => f.id === saved) : undefined;
        const first = savedForm ?? res.items.find((f) => f.status === "PUBLISHED") ?? res.items[0];
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
        <h1 className="mr-auto text-2xl font-semibold">业务数据</h1>
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
        <Select
          value={formId}
          onChange={(e) => {
            const id = e.target.value;
            setFormId(id);
            sessionStorage.setItem(FORM_ID_KEY, id);
          }}
        >
          {forms.map((f) => (
            <option key={f.id} value={f.id}>
              {formOptionLabel(f, forms)}
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
          <option value="submitted">审批中</option>
          <option value="archived">已通过</option>
          <option value="rejected">已驳回</option>
        </Select>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {notice ? <p className="text-sm text-green-700">{notice}</p> : null}
      <Card className="overflow-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left">
            <tr>
              <th className="px-3 py-2">提交人</th>
              <th className="px-3 py-2 cursor-pointer" onClick={() => toggleSort("status")}>
                状态 {sort === "status" ? (order === "asc" ? "↑" : "↓") : ""}
              </th>
              {fields.slice(0, 4).map((f) => (
                <th key={f.name} className="px-3 py-2 cursor-pointer" onClick={() => toggleSort(f.name)}>
                  {f.title} {sort === f.name ? (order === "asc" ? "↑" : "↓") : ""}
                </th>
              ))}
              <th className="px-3 py-2">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t">
                <td className="px-3 py-2">{row.creator?.name || "—"}</td>
                <td className="px-3 py-2">{labelOf(RECORD_STATUS, row.status)}</td>
                {fields.slice(0, 4).map((f) => (
                  <td key={f.name} className="px-3 py-2">
                    {displayFieldValue(f, row.dataJson?.[f.name])}
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
      {form && total === 0 ? (
        <p className="text-sm text-muted-foreground">
          「{form.name}」暂无记录。数据按表单分开存放，请在上方切换到刚才提交时用的那一张（同名表单看后面的时间）。
        </p>
      ) : null}
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
        <Modal open title="新增" onClose={() => setCreating(false)}>
          <SchemaForm
            schemaJson={form.schemaJson}
            layoutJson={form.layoutJson}
            linkageJson={form.linkageJson}
            onSubmit={async (values) => {
              await recordApi.create(form.id, values);
              setCreating(false);
              setNotice(`已提交到「${form.name}」`);
              sessionStorage.setItem(FORM_ID_KEY, form.id);
              try {
                await load(form.id, 1, status, keyword, sort, order);
              } catch (err) {
                setError(err instanceof Error ? err.message : "刷新列表失败");
              }
            }}
          />
        </Modal>
      ) : null}
      {form && editing ? (
        <Modal open title="编辑" onClose={() => setEditing(null)}>
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
        <Modal open title="详情" onClose={() => setDetail(null)}>
          <RecordDetailView detail={detail} />
        </Modal>
      ) : null}
    </div>
  );
}

function RecordDetailView({ detail }: { detail: Record<string, unknown> }) {
  const form = detail.form as { name?: string; schemaJson?: Record<string, unknown>; layoutJson?: Record<string, unknown> } | undefined;
  const fields = form ? fieldsFromForm(form.schemaJson ?? {}, form.layoutJson ?? {}) : [];
  const data = (detail.dataJson as Record<string, unknown>) ?? {};
  const instances = (detail.instances as {
    status?: string;
    workflow?: { name?: string };
    tasks?: { nodeName?: string; status?: string }[];
    logs?: { nodeName?: string; action?: string; comment?: string; createdAt?: string }[];
  }[]) ?? [];
  return (
    <div className="space-y-4 text-sm">
      <div>
        <div className="font-medium">{form?.name ?? "申请"}</div>
        <div className="text-muted-foreground">状态：{labelOf(RECORD_STATUS, String(detail.status ?? ""))}</div>
      </div>
      <dl className="grid gap-2 sm:grid-cols-2">
        {fields.map((f) => (
          <div key={f.name}>
            <dt className="text-muted-foreground">{f.title}</dt>
            <dd>{displayFieldValue(f, data[f.name])}</dd>
          </div>
        ))}
      </dl>
      {instances.map((inst, i) => (
        <div key={i} className="space-y-2 border-t pt-3">
          <div className="font-medium">
            {inst.workflow?.name ?? "审批流程"} · {labelOf(INSTANCE_STATUS, inst.status)}
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            {(inst.tasks ?? []).map((t, j) => (
              <span key={j}>
                {t.nodeName}（{labelOf(TASK_STATUS, t.status)}）
              </span>
            ))}
          </div>
          <ol className="space-y-2">
            {(inst.logs ?? []).map((log, j) => (
              <li key={j}>
                {log.nodeName ?? "系统"} · {labelOf(FLOW_ACTION, log.action)}
                {log.comment ? `：${log.comment}` : ""}
                {log.createdAt ? (
                  <span className="ml-2 text-xs text-muted-foreground">{new Date(log.createdAt).toLocaleString()}</span>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}
