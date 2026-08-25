import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Image, Pencil, Plus, Search, Trash2, UploadCloud } from "lucide-react";
import axiosInstance from "@/services/api/axios";

type PageKey = "home" | "dashboard" | "privacy" | "mission" | "terms" | "services" | "help";
type ContentType = "article" | "review" | "image";

type ContentItem = {
  id: string;
  page_key: PageKey;
  content_type: ContentType;
  title: string | null;
  body: string | null;
  image_url: string | null;
  placement: "top" | "middle" | "bottom";
  is_published: boolean;
  sort_order: number;
};

const pages: Array<{ key: PageKey; label: string; route: string; routeLabel: string }> = [
  { key: "home", label: "Trang chủ", route: "/", routeLabel: "/" },
  { key: "dashboard", label: "Bảng điều khiển", route: "/dashboard", routeLabel: "/dashboard" },
  { key: "privacy", label: "Chính sách bảo mật", route: "/privacy", routeLabel: "/privacy" },
  { key: "mission", label: "Sứ mệnh", route: "/mission", routeLabel: "/mission" },
  { key: "terms", label: "Điều khoản sử dụng", route: "/terms", routeLabel: "/terms" },
  { key: "services", label: "Dịch vụ trên Dashboard", route: "/dashboard", routeLabel: "/dashboard" },
  { key: "help", label: "Trợ giúp", route: "/help", routeLabel: "/help" },
];

const emptyForm = {
  page_key: "home" as PageKey,
  content_type: "article" as ContentType,
  title: "",
  body: "",
  image_url: "",
  placement: "middle" as "top" | "middle" | "bottom",
  is_published: true,
  sort_order: 0,
};

export default function ContentManagementTab() {
  const queryClient = useQueryClient();
  const [pageFilter, setPageFilter] = useState<PageKey | "all">("all");
  const [typeFilter, setTypeFilter] = useState<ContentType | "all">("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const contentQuery = useQuery({
    queryKey: ["admin-content", pageFilter, typeFilter],
    queryFn: async () => (await axiosInstance.get<ContentItem[]>("/v1/admin/content", {
      params: {
        ...(pageFilter !== "all" ? { page_key: pageFilter } : {}),
        ...(typeFilter !== "all" ? { content_type: typeFilter } : {}),
      },
    })).data,
  });

  const allContentQuery = useQuery({
    queryKey: ["admin-content-all"],
    queryFn: async () => (await axiosInstance.get<ContentItem[]>("/v1/admin/content")).data,
  });

  const filteredContent = useMemo(() => {
    const keyword = searchTerm.trim().toLocaleLowerCase();
    const matchingItems = !keyword ? (contentQuery.data || []) : (contentQuery.data || []).filter((item) =>
      [item.title, item.body].some((value) =>
        value?.toLocaleLowerCase().includes(keyword),
      ),
    );
    const pageOrder = new Map(pages.map((page, index) => [page.key, index]));
    const placementOrder = { top: 0, middle: 1, bottom: 2 };
    return [...matchingItems].sort((left, right) =>
      (pageOrder.get(left.page_key) ?? Number.MAX_SAFE_INTEGER) -
        (pageOrder.get(right.page_key) ?? Number.MAX_SAFE_INTEGER) ||
      placementOrder[left.placement] - placementOrder[right.placement] ||
      left.sort_order - right.sort_order,
    );
  }, [contentQuery.data, searchTerm]);
  const selectedPage = pages.find((page) => page.key === pageFilter);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editingId) return axiosInstance.patch(`/v1/admin/content/${editingId}`, form);

      const pageItems = (allContentQuery.data || []).filter((item) => item.page_key === form.page_key);
      const usedNumbers = pageItems
        .map((item) => Number(item.title?.match(/^(\d+)\.\s/)?.[1] || 0))
        .filter((number) => Number.isFinite(number));
      const nextNumber = Math.max(0, ...usedNumbers) + 1;
      const cleanTitle = form.title.trim().replace(/^\d+\.\s*/, "");

      return axiosInstance.post("/v1/admin/content", {
        ...form,
        title: cleanTitle ? `${nextNumber}. ${cleanTitle}` : `${nextNumber}. Nội dung mới`,
      });
    },
    onSuccess: () => {
      setForm(emptyForm);
      setEditingId(null);
      setError("");
      void queryClient.invalidateQueries({ queryKey: ["admin-content"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-content-all"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (item: ContentItem) => axiosInstance.delete(`/v1/admin/content/${item.id}`),
    onSuccess: (_response, item) => {
      setError("");
      setNotice(item.content_type === "image" ? "Đã xóa hình ảnh thành công." : "Đã xóa nội dung thành công.");
      void queryClient.invalidateQueries({ queryKey: ["admin-content"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-content-all"] });
      void queryClient.invalidateQueries({ queryKey: ["public-content"] });
    },
    onError: () => {
      setNotice("");
      setError("Không thể xóa nội dung. Vui lòng thử lại.");
    },
  });

  const uploadImage = async (file: File) => {
    if (!file.type.startsWith("image/")) return setError("Chỉ hỗ trợ tệp hình ảnh.");
    if (file.size > 8 * 1024 * 1024) return setError("Ảnh không được vượt quá 8 MB.");
    setImageUploading(true);
    setError("");
    try {
      const data = new FormData();
      data.append("file", file);
      const response = await axiosInstance.post<{ image_url: string }>("/v1/admin/content/upload-image", data, { headers: { "Content-Type": "multipart/form-data" } });
      setForm((current) => ({ ...current, image_url: response.data.image_url }));
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Không thể tải ảnh lên.");
    } finally {
      setImageUploading(false);
    }
  };

  const handleImageFile = (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (file) void uploadImage(file);
  };

  const editItem = (item: ContentItem) => {
    setForm({
      page_key: item.page_key,
      content_type: item.content_type,
      title: item.title || "",
      body: item.body || "",
      image_url: item.image_url || "",
      placement: item.placement,
      is_published: item.is_published,
      sort_order: item.sort_order,
    });
    setEditingId(item.id);
  };

  return (
    <div className="space-y-6 rounded-3xl bg-gradient-to-br from-slate-50 via-white to-violet-50 p-4 sm:p-6">
      {(notice || error) && (
        <div className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm font-medium ${notice ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-600"}`} role="status">
          <span>{notice || error}</span>
          <button type="button" onClick={() => { setNotice(""); setError(""); }} className="ml-4 text-lg leading-none" aria-label="Đóng thông báo">×</button>
        </div>
      )}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Quản lý nội dung</h2>
          <p className="mt-1 text-sm text-slate-500">Quản lý bài viết, đánh giá và hình ảnh theo từng trang.</p>
        </div>
        <button type="button" onClick={() => { setForm(emptyForm); setEditingId(null); }} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
          <Plus className="h-4 w-4" /> Thêm nội dung
        </button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm">
          <div className="flex flex-wrap gap-3 border-b border-blue-100 bg-blue-50/60 p-4">
            <label className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Tìm theo tiêu đề hoặc nội dung"
                aria-label="Tìm kiếm nội dung"
                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </label>
            <select value={pageFilter} onChange={(event) => setPageFilter(event.target.value as PageKey | "all")} className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
              <option value="all">Tất cả trang</option>{pages.map((page) => <option key={page.key} value={page.key}>{page.label}</option>)}
            </select>
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as ContentType | "all")} className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
              <option value="all">Tất cả loại</option><option value="article">Bài viết</option><option value="review">Đánh giá</option><option value="image">Hình ảnh</option>
            </select>
            {selectedPage && (
              <button
                type="button"
                onClick={() => window.open(`${window.location.origin}${selectedPage.route}`, "_blank", "noopener,noreferrer")}
                className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
              >
                Mở {selectedPage.routeLabel}
              </button>
            )}
          </div>
          {contentQuery.isLoading ? <p className="p-6 text-sm text-slate-500">Đang tải nội dung...</p> : contentQuery.isError ? <p className="p-6 text-sm text-red-600">Không thể tải nội dung quản lý.</p> : (
            <div className="divide-y divide-slate-100">
              {filteredContent.map((item) => (
                <div key={item.id} className="flex gap-4 p-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 text-slate-400">
                    {item.image_url ? <img src={item.image_url} alt="" className="h-full w-full object-contain" /> : <Image className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-slate-800">{item.title || "Chưa có tiêu đề"}</span><span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">{pages.find((page) => page.key === item.page_key)?.label} · {pages.find((page) => page.key === item.page_key)?.routeLabel} · {item.content_type}</span><span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700">{item.placement === "top" ? "Đầu trang" : item.placement === "bottom" ? "Cuối trang" : "Giữa trang"}</span><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${item.is_published ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{item.is_published ? "Đã xuất bản" : "Bản nháp"}</span></div>
                    <p className="mt-1 line-clamp-2 text-sm text-slate-500">{item.body || item.image_url || "Chưa có nội dung"}</p>
                  </div>
                  <div className="flex shrink-0 items-start gap-1"><button type="button" onClick={() => editItem(item)} className="rounded-lg p-2 text-slate-400 hover:bg-blue-50 hover:text-blue-600" aria-label="Sửa"><Pencil className="h-4 w-4" /></button><button type="button" onClick={() => { if (window.confirm("Xóa nội dung này?")) { setNotice(""); setError(""); deleteMutation.mutate(item); } }} disabled={deleteMutation.isPending} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50" aria-label="Xóa"><Trash2 className="h-4 w-4" /></button></div>
                </div>
              ))}
              {!filteredContent.length && <p className="p-8 text-center text-sm text-slate-500">{searchTerm.trim() ? "Không tìm thấy nội dung phù hợp." : "Chưa có nội dung nào."}</p>}
            </div>
          )}
        </section>

        <form onSubmit={(event) => { event.preventDefault(); saveMutation.mutate(); }} className="space-y-4 rounded-2xl border border-violet-100 bg-gradient-to-b from-violet-50 to-white p-5 shadow-sm">
          <h3 className="font-bold text-slate-900">{editingId ? "Chỉnh sửa nội dung" : "Thêm nội dung mới"}</h3>
          <select value={form.page_key} onChange={(event) => setForm({ ...form, page_key: event.target.value as PageKey })} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm">{pages.map((page) => <option key={page.key} value={page.key}>{page.label}</option>)}</select>
          <select value={form.content_type} onChange={(event) => setForm({ ...form, content_type: event.target.value as ContentType })} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"><option value="article">Bài viết</option><option value="review">Đánh giá</option><option value="image">Hình ảnh</option></select>
          <select value={form.placement} onChange={(event) => setForm({ ...form, placement: event.target.value as "top" | "middle" | "bottom" })} className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm"><option value="top">Đầu trang</option><option value="middle">Giữa trang</option><option value="bottom">Cuối trang</option></select>
          <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Tiêu đề" className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500" />
          <textarea value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} placeholder="Nội dung hoặc mô tả" rows={5} className="w-full resize-y rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-500" />
          <label onDragOver={(event) => { event.preventDefault(); setIsDraggingImage(true); }} onDragLeave={() => setIsDraggingImage(false)} onDrop={(event) => { event.preventDefault(); setIsDraggingImage(false); handleImageFile(event.dataTransfer.files); }} className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors ${isDraggingImage ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-slate-50 hover:border-blue-400 hover:bg-blue-50/50"}`}>
            <UploadCloud className="mb-2 h-7 w-7 text-blue-500" />
            <span className="text-sm font-semibold text-slate-700">{imageUploading ? "Đang tải ảnh lên..." : "Chọn ảnh hoặc kéo ảnh vào đây"}</span>
            <span className="mt-1 text-xs text-slate-400">JPG, PNG, WebP hoặc GIF · tối đa 8 MB</span>
            <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(event) => { handleImageFile(event.target.files); event.target.value = ""; }} className="hidden" />
          </label>
          <input value={form.image_url} onChange={(event) => setForm({ ...form, image_url: event.target.value })} placeholder="Hoặc dán link ảnh từ Unsplash/Pexels" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500" />
          {form.image_url && <div className="flex items-center gap-3 rounded-lg border border-slate-200 p-2"><img src={form.image_url} alt="Ảnh đã chọn" className="h-12 w-12 rounded-md bg-slate-50 object-contain" /><span className="min-w-0 flex-1 truncate text-xs text-slate-500">Đã chọn ảnh</span><button type="button" onClick={() => setForm({ ...form, image_url: "" })} className="text-xs font-semibold text-red-500 hover:text-red-700">Xóa ảnh</button></div>}
          <div className="flex gap-3"><input type="number" min={0} value={form.sort_order} onChange={(event) => setForm({ ...form, sort_order: Number(event.target.value) })} className="w-24 rounded-lg border border-slate-200 px-3 py-2.5 text-sm" /><label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={form.is_published} onChange={(event) => setForm({ ...form, is_published: event.target.checked })} /> Xuất bản</label></div>
          {(error || saveMutation.isError) && <p className="text-sm text-red-600">{error || "Không thể lưu nội dung."}</p>}
          <div className="flex gap-2"><button type="submit" disabled={saveMutation.isPending} className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">{saveMutation.isPending ? "Đang lưu..." : editingId ? "Lưu thay đổi" : "Tạo nội dung"}</button>{editingId && <button type="button" onClick={() => { setForm(emptyForm); setEditingId(null); }} className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600">Hủy</button>}</div>
        </form>
      </div>
    </div>
  );
}
