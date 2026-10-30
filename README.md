# xkill

> Interactive high-performance terminal UI tool to inspect and purge heavy project dependencies, Windows AppData caches, system temp files, and empty folder trees.

---

## 🚀 Tính năng nổi bật (Features)

- **High-Performance Crawler:** Tích hợp engine crawler [`fdir`](https://github.com/thecodrr/fdir), duyệt hàng trăm nghìn files/thư mục trong vài trăm mili-giây mà không chiếm dụng bộ nhớ hay nghẽn I/O.
- **Bounded Concurrency Sizing:** Thuật toán tính kích thước thư mục theo hàng đợi phân đoạn (16 workers, 32 chunks), ngăn chặn hoàn toàn lỗi kiệt file descriptor (`EMFILE`) trên các cây thư mục khổng lồ.
- **Presets Hệ thống & AppData:** Dọn dẹp có định hướng với các profile dựng sẵn (`appdata`, `temp`, `dev-cache`, `build-dirs`).
- **Recycle Bin Soft Deletion (`--trash`):** Tùy chọn chuyển file/thư mục vào Thùng rác (Windows Recycle Bin) thay vì xóa vĩnh viễn, an toàn tuyệt đối khi dọn dẹp hệ thống.
- **Phát hiện & Xử lý File Bị Khóa (`EBUSY` / `EPERM`):** Tự động nhận diện file/thư mục đang bị tiến trình khác chiếm dụng, gắn nhãn `🔒 [LOCKED]` trên TUI và tiếp tục batch mà không gây crash.
- **Empty Directory Cleaner (`--clean-empty`):** Quét và thanh lọc toàn bộ các cây thư mục rỗng do phần mềm cũ để lại.
- **Lọc theo độ tuổi (`--older-than`):** Hỗ trợ lọc file/thư mục cũ theo thời gian sửa đổi (ví dụ: `30d`, `24h`, `60m`), tránh xóa nhầm cache vừa tạo.
- **Pattern Matching (`--pattern`):** Mở rộng quét file đơn lẻ theo định dạng wildcard glob (`*.tmp`, `*.log`, `*.dmp`, `thumbs.db`).
- **Giao diện Ink TUI tương tác thời gian thực:** Render bằng Ink & React 19, tự động co giãn theo chiều cao terminal, điều hướng mượt mà, phân trang chống giật khung hình.

---

## 📊 Bảng tổng hợp chức năng, Use Case & Tham số CLI

| Flag / Tính năng | Mô tả chức năng (Description) | Use Case phù hợp | Ví dụ câu lệnh |
| :--- | :--- | :--- | :--- |
| **Mặc định** | Quét các thư mục build/dependency phổ biến (`node_modules`, `.next`, `dist`, `build`, `target`) | Dọn dẹp nhanh các project lập trình trong thư mục hiện tại | `xkill` |
| `--preset appdata`<br>`-p appdata` | Tự động định vị `%LOCALAPPDATA%` để quét thư mục `Temp`, `CrashDumps`, `logs`, và file rác `*.tmp`, `*.log`, `*.dmp` | Dọn dẹp rác, cache, crash dumps phình to trong ổ C của Windows | `xkill --preset appdata --trash` |
| `--preset temp`<br>`-p temp` | Quét toàn bộ thư mục tạm thời của hệ điều hành (`os.tmpdir()`) | Giải phóng dung lượng ổ đĩa hệ thống định kỳ | `xkill --preset temp` |
| `--preset dev-cache`<br>`-p dev-cache` | Quét cache của các package manager: `npm-cache`, `.pnpm-store`, `pip/cache`, `yarn/Cache` | Lập trình viên muốn giải phóng hàng chục GB cache tải gói thư viện | `xkill --preset dev-cache` |
| `--trash` | Chuyển mục bị xóa vào Windows Recycle Bin (Thùng rác) thay vì xóa cứng (`fs.rm`) | Thao tác trên thư mục hệ thống / AppData cần khả năng khôi phục khi cần | `xkill -p appdata --trash` |
| `--clean-empty` | Nhận diện và liệt kê các thư mục rỗng (size = 0, không chứa file con) | Dọn dẹp các thư mục mồ côi do ứng dụng gỡ cài đặt để lại | `xkill ./projects --clean-empty` |
| `--older-than <time>` | Lọc theo thời gian chỉnh sửa cuối (`mtime`). Hỗ trợ đơn vị: `s` (giây), `m` (phút), `h` (giờ), `d` (ngày), `w` (tuần) | Chỉ dọn dẹp các file cache/temp cũ không dùng đến trong X ngày | `xkill -p appdata --older-than 30d` |
| `--pattern <glob>` | Lọc các file đơn lẻ khớp với mẫu wildcard (phân tách bằng dấu phẩy) | Dọn dẹp các file log, dump, backup cụ thể | `xkill --pattern "*.log, *.tmp, *.dmp"` |
| `--target, -t` | Tùy chỉnh danh sách tên thư mục mục tiêu cần tìm kiếm | Quét các folder đặc thù riêng của dự án (`coverage`, `.cache`, `out`) | `xkill -t coverage, out, .turbo` |
| `[path]` | Chỉ định đường dẫn thư mục gốc cần quét (tương đối hoặc tuyệt đối) | Quét ổ đĩa khác hoặc một workspace cụ thể | `xkill D:/Workspaces` |

---

## 🎯 Hướng dẫn chi tiết từng trường hợp sử dụng (Use Cases)

### Trường hợp 1: Dọn dẹp an toàn thư mục AppData\Local trên Windows
Thư mục `%LOCALAPPDATA%` thường chứa hàng chục GB cache, file crash dump và temp của các phần mềm (Chrome, VSCode, Discord, game...). Khi dọn dẹp thư mục này, nên kết hợp `--trash` (chuyển vào Thùng rác) và `--older-than` (chỉ xóa file cũ hơn 14 ngày):

```bash
# Dọn dẹp AppData Local an toàn: chỉ gom file cũ hơn 14 ngày và đưa vào Thùng rác
xkill --preset appdata --older-than 14d --trash
```
> **Cơ chế an toàn:** Nếu có file đang được một phần mềm chạy nền sử dụng, `xkill` sẽ không báo lỗi crash mà tự động đánh dấu nhãn `🔒 [LOCKED]` và tiếp tục cho phép xóa các file khác.

---

### Trường hợp 2: Quét và thanh lọc toàn bộ Workspace dự án
Giải phóng dung lượng các thư mục `node_modules`, `.next`, `dist` chiếm dụng trên ổ làm việc:

```bash
# Quét thư mục hiện tại
xkill

# Quét một phân vùng hoặc thư mục workspace cụ thể
xkill D:/Projects

# Kết hợp dọn dẹp cả các thư mục rỗng còn sót lại
xkill D:/Projects --clean-empty
```

---

### Trường hợp 3: Dọn dẹp bộ nhớ đệm lập trình (Dev Caches)
Các công cụ như NPM, PNPM, Yarn, Pip lưu trữ bản sao của mọi package đã tải về máy:

```bash
# Quét sạch cache của các package manager
xkill --preset dev-cache
```

---

### Trường hợp 4: Quét dọn file tạm hệ thống (System Temp)
Dọn dẹp thư mục `Temp` của hệ điều hành với các file không dùng trên 7 ngày:

```bash
# Quét Temp hệ thống, lọc file cũ hơn 7 ngày, cho vào Recycle Bin
xkill --preset temp --older-than 7d --trash
```

---

### Trường hợp 5: Tìm kiếm file rác theo định dạng mở rộng (Pattern Matching)
Quét và xóa các file log, dump lỗi, hoặc file backup tạm:

```bash
# Tìm kiếm các file .tmp, .log, .dmp trong thư mục chỉ định
xkill C:/Users/YourUser/Downloads --pattern "*.tmp, *.log, *.dmp"
```

---

### Trường hợp 6: Kết hợp Preset với ghi đè tham số (Custom Overrides)
Bạn có thể dùng preset làm cấu hình nền và tùy biến thêm các tham số khác:

```bash
# Dùng preset appdata nhưng chỉ quét trong một thư mục con cụ thể và bổ sung thêm đuôi *.bak
xkill "C:/Users/YourUser/AppData/Local/Temp" --preset appdata --pattern "*.bak" --trash
```

---

## ⌨️ Phím tắt điều khiển (Keybindings)

| Phím | Chức năng |
| :--- | :--- |
| `↑` / `↓` | Di chuyển con trỏ lên / xuống danh sách |
| `Space` hoặc `d` | Mở hộp thoại xác nhận xóa cho mục đang chọn |
| `y` | Xác nhận thực hiện xóa (hoặc chuyển vào Recycle Bin nếu bật `--trash`) |
| `n` hoặc `Esc` | Hủy bỏ hộp thoại xác nhận xóa |
| `q` hoặc `Esc` | Thoát ứng dụng ngay lập tức (hủy an toàn toàn bộ I/O đang chạy) |

---

## 🏷️ Các nhãn trạng thái trên TUI (Status Badges)

*   `[EMPTY]`: Thư mục rỗng (kích thước 0 B, không chứa file con).
*   `⏳ [deleting...]`: Đang trong tiến trình xóa bất đồng bộ.
*   `✔ [DELETED]`: Đã xóa thành công (kích thước giải phóng được cộng dồn vào mục **Saved**).
*   `🔒 [LOCKED]`: Thao tác xóa thất bại do file/thư mục đang bị tiến trình Windows khác khóa (`EBUSY` / `EPERM`).
*   `✖ [ERROR]`: Thao tác xóa thất bại do lỗi hệ thống khác (kèm mã lỗi chi tiết).

---

## 📦 Cài đặt & Sử dụng (Installation)

### Chạy trực tiếp qua `npx` / `pnpm dlx` (Không cần cài đặt)

```bash
# npm
npx xkill

# pnpm
pnpm dlx xkill
```

### Cài đặt toàn cục (Global Install)

```bash
# pnpm (Khuyên dùng)
pnpm add -g xkill

# npm
npm install -g xkill
```

---

## 🛠️ Cấu trúc dự án (Project Architecture)

```
x-kill/
├── src/
│   ├── App.tsx          # Giao diện Ink TUI (hiển thị danh sách, badge, xử lý phím và xóa)
│   ├── cli-parser.ts    # Bộ tách token CLI flags, phân tích duration (parseDuration)
│   ├── delete-utils.ts  # Cơ chế xóa an toàn (deleteItem: trash vs fs.rm, bắt lỗi file lock)
│   ├── fs-utils.ts      # Crawler hiệu năng cao (fdir), bounded concurrency sizing, glob matching
│   ├── index.tsx        # Điểm khởi chạy CLI wrapper và meow configuration
│   └── presets.ts       # Danh mục các bộ profile chuẩn (appdata, temp, dev-cache, build-dirs)
├── tests/
│   ├── app.test.tsx     # Kiểm thử component TUI (header, prompt, locked badges, delegation)
│   ├── cli-args.test.ts # Kiểm thử parser CLI flags và duration
│   ├── delete-utils.test.ts # Kiểm thử cơ chế xóa, soft-delete và mô phỏng EBUSY
│   ├── fs-utils.test.ts # Kiểm thử crawler fdir, tính size, pattern matching, cancellation
│   └── presets.test.ts  # Kiểm thử danh mục preset và resolution
├── dist/                # Mã nguồn ES Module đã biên dịch
├── package.json
└── tsconfig.json
```

---

## 🧪 Kiểm thử & Phát triển (Development)

```bash
# Cài đặt thư viện phát triển
pnpm install

# Khởi chạy chế độ phát triển
pnpm dev

# Chạy toàn bộ 77 unit & integration tests (Vitest)
pnpm test

# Biên dịch TypeScript sang ES Module
pnpm run build
```

---

## 📄 License

MIT © HuyPaul
