# Timi Mobile

Ứng dụng Android React Native/Expo dùng chung FastAPI backend với website Timi.

## Những phần đã có

- Giao diện đăng nhập và đăng ký OTP.
- Lưu JWT an toàn bằng `expo-secure-store`.
- Dashboard số dư, thao tác nhanh và giao dịch gần đây.
- Tra cứu người nhận và gọi API đánh giá rủi ro giao dịch.
- Quét QR thật bằng camera Android.
- Lịch sử giao dịch và trang hồ sơ/bảo mật.
- Chế độ xem thiết kế trong development khi backend chưa sẵn sàng.
- Cấu hình EAS cho APK thử nghiệm và AAB phát hành.

## Chạy nhanh

```powershell
cd mobile
Copy-Item .env.example .env.local
npm ci
npx expo start --clear
```

Sửa `EXPO_PUBLIC_API_URL` trong `.env.local` trước khi đăng nhập thật:

```env
EXPO_PUBLIC_API_URL=https://timi-3j0h.onrender.com/api
```

Quét QR terminal bằng Expo Go trên Android. Tại màn đăng nhập, nút **Xem nhanh
bản thiết kế** chỉ xuất hiện trong development.

## Backend local

Android Emulator truy cập máy tính bằng địa chỉ `10.0.2.2`, vì vậy app mặc định
dùng:

```text
http://10.0.2.2:8000/api
```

Điện thoại thật phải dùng IP LAN của máy tính, không dùng `localhost`:

```env
EXPO_PUBLIC_API_URL=http://192.168.1.20:8000/api
```

Backend cần chạy với `--host 0.0.0.0` và điện thoại phải cùng Wi-Fi.

## Kiểm tra

```powershell
npx tsc --noEmit
npx expo-doctor
npx expo export --platform android
```

Hướng dẫn Google Login, development build và phát hành nằm trong `SETUP.md` ở
repository root.
