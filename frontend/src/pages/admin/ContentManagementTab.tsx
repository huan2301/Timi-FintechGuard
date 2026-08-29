import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  ExternalLink,
  FileText,
  Image,
  LayoutTemplate,
  LoaderCircle,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import axiosInstance from "@/services/api/axios";

type PageKey =
  | "home"
  | "dashboard"
  | "privacy"
  | "mission"
  | "terms"
  | "services"
  | "help"
  | "cookies"
  | "download"
  | "demo";
type ContentType = "article" | "review" | "image";
type Placement = "top" | "middle" | "bottom";

type ContentItem = {
  id: string;
  page_key: PageKey;
  content_type: ContentType;
  title: string | null;
  body: string | null;
  image_url: string | null;
  placement: Placement;
  is_published: boolean;
  sort_order: number;
};

type ContentForm = {
  page_key: PageKey;
  content_type: ContentType;
  title: string;
  body: string;
  image_url: string;
  placement: Placement;
  is_published: boolean;
  sort_order: number;
};

const pages: Array<{ key: PageKey; label: string; route: string; routeLabel: string }> = [
  { key: "home", label: "Trang chủ", route: "/", routeLabel: "/" },
  { key: "dashboard", label: "Bảng điều khiển", route: "/dashboard", routeLabel: "/dashboard" },
  { key: "privacy", label: "Chính sách bảo mật", route: "/privacy", routeLabel: "/privacy" },
  { key: "mission", label: "Sứ mệnh", route: "/mission", routeLabel: "/mission" },
  { key: "terms", label: "Điều khoản sử dụng", route: "/terms", routeLabel: "/terms" },
  { key: "services", label: "Dịch vụ", route: "/services", routeLabel: "/services" },
  { key: "help", label: "Trợ giúp", route: "/help", routeLabel: "/help" },
  { key: "cookies", label: "Chính sách Cookie", route: "/cookies", routeLabel: "/cookies" },
  { key: "download", label: "Tải ứng dụng", route: "/download", routeLabel: "/download" },
  { key: "demo", label: "Demo Timi Guard", route: "/demo", routeLabel: "/demo" },
];

const createEmptyForm = (): ContentForm => ({
  page_key: "home",
  content_type: "article",
  title: "",
  body: "",
  image_url: "",
  placement: "middle",
  is_published: true,
  sort_order: 0,
});

const placementLabels: Record<Placement, string> = {
  top: "Đầu trang",
  middle: "Giữa trang",
  bottom: "Cuối trang",
};

const contentTypeLabels: Record<ContentType, string> = {
  article: "Bài viết",
  review: "Đánh giá",
  image: "Hình ảnh",
};

const getPage = (key: PageKey) => pages.find((page) => page.key === key);

const getApiErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = (error as { response?: { data?: { detail?: string } } }).response;
    if (response?.data?.detail) return response.data.detail;
  }
  return fallback;
};

export default function ContentManagementTab() {
  const queryClient = useQueryClient();
  const [pageFilter, setPageFilter] = useState<PageKey | "all">("all");
  const [typeFilter, setTypeFilter] = useState<ContentType | "all">("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [form, setForm] = useState<ContentForm>(() => createEmptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const editorRef = useRef<HTMLFormElement>(null);

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
      [item.title, item.body].some((value) => value?.toLocaleLowerCase().includes(keyword)),
    );
    const pageOrder = new Map(pages.map((page, index) => [page.key, index]));
    const placementOrder: Record<Placement, number> = { top: 0, middle: 1, bottom: 2 };
    return [...matchingItems].sort((left, right) =>
      (pageOrder.get(left.page_key) ?? Number.MAX_SAFE_INTEGER) -
        (pageOrder.get(right.page_key) ?? Number.MAX_SAFE_INTEGER) ||
      placementOrder[left.placement] - placementOrder[right.placement] ||
      left.sort_order - right.sort_order,
    );
  }, [contentQuery.data, searchTerm]);

  const stats = useMemo(() => {
    const allItems = allContentQuery.data || [];
    return {
      total: allItems.length,
      published: allItems.filter((item) => item.is_published).length,
      images: allItems.filter((item) => item.image_url || item.content_type === "image").length,
      drafts: allItems.filter((item) => !item.is_published).length,
    };
  }, [allContentQuery.data]);

  const selectedPage = pageFilter === "all" ? undefined : getPage(pageFilter);

  const resetEditor = () => {
    setForm(createEmptyForm());
    setEditingId(null);
    setError("");
  };

  const openCreateEditor = () => {
    resetEditor();
    setNotice("");
    window.requestAnimationFrame(() => {
      editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      editorRef.current?.querySelector<HTMLElement>("select, input:not([type='file']), textarea")?.focus({ preventScroll: true });
    });
  };

  const updateForm = <Key extends keyof ContentForm>(key: Key, value: ContentForm[Key]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

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
      setNotice(editingId ? "Đã cập nhật nội dung thành công." : "Đã tạo nội dung mới.");
      resetEditor();
      void queryClient.invalidateQueries({ queryKey: ["admin-content"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-content-all"] });
      void queryClient.invalidateQueries({ queryKey: ["public-content"] });
    },
    onError: (mutationError) => {
      setNotice("");
      setError(getApiErrorMessage(mutationError, "Không thể lưu nội dung. Vui lòng thử lại."));
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
    onError: (mutationError) => {
      setNotice("");
      setError(getApiErrorMessage(mutationError, "Không thể xóa nội dung. Vui lòng thử lại."));
    },
  });

  const uploadImage = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Chỉ hỗ trợ tệp hình ảnh.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("Ảnh không được vượt quá 8 MB.");
      return;
    }
    setImageUploading(true);
    setError("");
    try {
      const data = new FormData();
      data.append("file", file);
      const response = await axiosInstance.post<{ image_url: string }>(
        "/v1/admin/content/upload-image",
        data,
        { headers: { "Content-Type": "multipart/form-data" } },
      );
      updateForm("image_url", response.data.image_url);
      setNotice("Đã tải ảnh lên. Bạn có thể xem trước ở bên dưới.");
    } catch (uploadError) {
      setError(getApiErrorMessage(uploadError, "Không thể tải ảnh lên."));
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
    setNotice("");
    setError("");
  };

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[28px] bg-slate-950 px-5 py-6 text-white shadow-xl shadow-slate-200 sm:px-8 sm:py-8">
        <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 left-1/3 h-56 w-56 rounded-full bg-violet-500/20 blur-3xl" />
        <div className="relative z-10 flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-semibold text-blue-200">
              <Sparkles className="h-3.5 w-3.5" /> CMS workspace
            </div>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Quản lý nội dung</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300 sm:text-base">
              Tạo, sắp xếp và xuất bản nội dung cho từng trang Timi từ một nơi duy nhất.
            </p>
          </div>
          <button
            type="button"
            onClick={openCreateEditor}
            aria-controls="content-editor"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-bold text-slate-900 transition hover:bg-blue-50"
          >
            <Plus className="h-4 w-4" /> Thêm nội dung
          </button>
        </div>
      </section>

      {(notice || error) && (
        <div className={`flex items-start justify-between gap-4 rounded-2xl border px-4 py-3 text-sm font-medium ${notice ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-600"}`} role="status">
          <span className="flex items-center gap-2">
            {notice && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
            {notice || error}
          </span>
          <button type="button" onClick={() => { setNotice(""); setError(""); }} className="rounded-md p-0.5 text-lg leading-none opacity-70 hover:opacity-100" aria-label="Đóng thông báo">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Tổng nội dung", value: stats.total, icon: LayoutTemplate, tone: "text-blue-600 bg-blue-50" },
          { label: "Đã xuất bản", value: stats.published, icon: Eye, tone: "text-emerald-600 bg-emerald-50" },
          { label: "Bản nháp", value: stats.drafts, icon: FileText, tone: "text-amber-600 bg-amber-50" },
          { label: "Có hình ảnh", value: stats.images, icon: Image, tone: "text-violet-600 bg-violet-50" },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-slate-500">{stat.label}</span>
                <span className={`rounded-xl p-2 ${stat.tone}`}><Icon className="h-4 w-4" /></span>
              </div>
              <p className="mt-3 text-2xl font-bold text-slate-900">{allContentQuery.isLoading ? "—" : stat.value}</p>
            </div>
          );
        })}
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_390px]">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-4 sm:p-5">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <h3 className="font-bold text-slate-900">Kho nội dung</h3>
                <p className="mt-1 text-xs text-slate-500">Chọn một mục để chỉnh sửa hoặc mở trang đang hiển thị.</p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                {filteredContent.length} kết quả
              </span>
            </div>
            <div className="mt-4 flex flex-col gap-3 lg:flex-row">
              <label className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Tìm theo tiêu đề hoặc nội dung"
                  aria-label="Tìm kiếm nội dung"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
                />
              </label>
              <select value={pageFilter} onChange={(event) => setPageFilter(event.target.value as PageKey | "all")} aria-label="Lọc theo trang" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-blue-500">
                <option value="all">Tất cả trang</option>
                {pages.map((page) => <option key={page.key} value={page.key}>{page.label}</option>)}
              </select>
              <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as ContentType | "all")} aria-label="Lọc theo loại nội dung" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-blue-500">
                <option value="all">Tất cả loại</option>
                {Object.entries(contentTypeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
              {selectedPage && (
                <a href={selectedPage.route} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm font-bold text-blue-700 transition hover:bg-blue-100">
                  Mở trang <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          </div>

          {contentQuery.isLoading ? (
            <div className="flex items-center gap-3 p-8 text-sm text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" /> Đang tải nội dung...</div>
          ) : contentQuery.isError ? (
            <p className="p-8 text-sm text-red-600">Không thể tải kho nội dung quản lý.</p>
          ) : filteredContent.length ? (
            <div className="divide-y divide-slate-100">
              {filteredContent.map((item) => {
                const page = getPage(item.page_key);
                return (
                  <article key={item.id} className="flex gap-3 p-4 transition hover:bg-slate-50/80 sm:gap-4 sm:p-5">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 text-slate-400 sm:h-14 sm:w-14">
                      {item.image_url ? <img src={item.image_url} alt="" className="h-full w-full object-contain" /> : <Image className="h-5 w-5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <h4 className="font-semibold text-slate-800">{item.title || "Chưa có tiêu đề"}</h4>
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">{page?.label || item.page_key}</span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{contentTypeLabels[item.content_type]}</span>
                        <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700">{placementLabels[item.placement]}</span>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${item.is_published ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                          {item.is_published ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                          {item.is_published ? "Đã xuất bản" : "Bản nháp"}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 break-words text-sm text-slate-500">{item.body || item.image_url || "Chưa có nội dung"}</p>
                      <p className="mt-2 text-xs text-slate-400">{page?.routeLabel || "Không xác định"} · thứ tự {item.sort_order}</p>
                    </div>
                    <div className="flex shrink-0 items-start gap-1">
                      <button type="button" onClick={() => editItem(item)} title="Chỉnh sửa" aria-label={`Chỉnh sửa ${item.title || "nội dung"}`} className="rounded-lg p-2 text-slate-400 transition hover:bg-blue-50 hover:text-blue-600"><Pencil className="h-4 w-4" /></button>
                      <button type="button" onClick={() => { if (window.confirm("Xóa nội dung này?")) { setNotice(""); setError(""); deleteMutation.mutate(item); } }} disabled={deleteMutation.isPending} title="Xóa" aria-label={`Xóa ${item.title || "nội dung"}`} className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="p-10 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400"><FileText className="h-5 w-5" /></div>
              <p className="mt-3 text-sm font-semibold text-slate-700">{searchTerm.trim() ? "Không tìm thấy nội dung phù hợp." : "Chưa có nội dung nào."}</p>
              <p className="mt-1 text-xs text-slate-500">Thử đổi bộ lọc hoặc tạo một nội dung mới.</p>
            </div>
          )}
        </section>

        <form id="content-editor" ref={editorRef} onSubmit={(event) => { event.preventDefault(); setNotice(""); setError(""); saveMutation.mutate(); }} className="scroll-mt-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:sticky xl:top-6">
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-blue-600">Editor</p>
              <h3 className="mt-1 font-bold text-slate-900">{editingId ? "Chỉnh sửa nội dung" : "Thêm nội dung mới"}</h3>
            </div>
            {editingId && <button type="button" onClick={resetEditor} title="Hủy chỉnh sửa" aria-label="Hủy chỉnh sửa" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-4 w-4" /></button>}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <label className="block text-sm font-semibold text-slate-700">Trang hiển thị
              <select value={form.page_key} onChange={(event) => updateForm("page_key", event.target.value as PageKey)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-normal text-slate-700 outline-none focus:border-blue-500 focus:bg-white">
                {pages.map((page) => <option key={page.key} value={page.key}>{page.label} · {page.routeLabel}</option>)}
              </select>
            </label>
            <label className="block text-sm font-semibold text-slate-700">Loại nội dung
              <select value={form.content_type} onChange={(event) => updateForm("content_type", event.target.value as ContentType)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-normal text-slate-700 outline-none focus:border-blue-500 focus:bg-white">
                {Object.entries(contentTypeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </label>
          </div>

          <label className="block text-sm font-semibold text-slate-700">Vị trí trên trang
            <select value={form.placement} onChange={(event) => updateForm("placement", event.target.value as Placement)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-normal text-slate-700 outline-none focus:border-blue-500 focus:bg-white">
              {Object.entries(placementLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>

          <label className="block text-sm font-semibold text-slate-700">Tiêu đề
            <input value={form.title} onChange={(event) => updateForm("title", event.target.value)} placeholder="Ví dụ: Bảo vệ giao dịch mỗi ngày" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-normal text-slate-700 outline-none transition focus:border-blue-500 focus:bg-white" />
          </label>

          <label className="block text-sm font-semibold text-slate-700">Nội dung hoặc mô tả
            <textarea value={form.body} onChange={(event) => updateForm("body", event.target.value)} placeholder="Nhập nội dung sẽ hiển thị trên trang..." rows={5} className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-normal leading-6 text-slate-700 outline-none transition focus:border-blue-500 focus:bg-white" />
          </label>

          <div>
            <p className="text-sm font-semibold text-slate-700">Hình ảnh</p>
            <label onDragOver={(event) => { event.preventDefault(); setIsDraggingImage(true); }} onDragLeave={() => setIsDraggingImage(false)} onDrop={(event) => { event.preventDefault(); setIsDraggingImage(false); handleImageFile(event.dataTransfer.files); }} className={`mt-1.5 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-5 text-center transition ${isDraggingImage ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-slate-50 hover:border-blue-400 hover:bg-blue-50/50"}`}>
              {imageUploading ? <LoaderCircle className="mb-2 h-7 w-7 animate-spin text-blue-500" /> : <UploadCloud className="mb-2 h-7 w-7 text-blue-500" />}
              <span className="text-sm font-semibold text-slate-700">{imageUploading ? "Đang tải ảnh lên..." : "Chọn ảnh hoặc kéo thả vào đây"}</span>
              <span className="mt-1 text-xs text-slate-400">JPG, PNG, WebP hoặc GIF · tối đa 8 MB</span>
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(event) => { handleImageFile(event.target.files); event.target.value = ""; }} className="hidden" />
            </label>
            <input value={form.image_url} onChange={(event) => updateForm("image_url", event.target.value)} placeholder="Hoặc dán URL ảnh" className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:bg-white" />
            {form.image_url && <div className="mt-2 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-2"><img src={form.image_url} alt="Ảnh xem trước" className="h-12 w-12 rounded-lg bg-white object-contain" /><span className="min-w-0 flex-1 truncate text-xs text-slate-500">Ảnh đã chọn</span><button type="button" onClick={() => updateForm("image_url", "")} className="rounded-md px-2 py-1 text-xs font-semibold text-red-500 hover:bg-red-50 hover:text-red-700">Xóa</button></div>}
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={form.is_published} onChange={(event) => updateForm("is_published", event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" /> Xuất bản ngay</label>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-500">Thứ tự
              <input type="number" min={0} value={form.sort_order} onChange={(event) => updateForm("sort_order", Number(event.target.value))} className="w-16 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-normal text-slate-700 outline-none focus:border-blue-500" />
            </label>
          </div>

          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={saveMutation.isPending || imageUploading} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
              {saveMutation.isPending && <LoaderCircle className="h-4 w-4 animate-spin" />}
              {saveMutation.isPending ? "Đang lưu..." : editingId ? "Lưu thay đổi" : "Tạo nội dung"}
            </button>
            {editingId && <button type="button" onClick={resetEditor} className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50">Hủy</button>}
          </div>
        </form>
      </div>
    </div>
  );
}
