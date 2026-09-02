import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { AppScreen, Card, InlineNotice, PageHeader, PrimaryButton, RoundIconButton } from '@/components/ui';
import { colors, radius, spacing } from '@/constants/theme';
import { useAuthStore } from '@/stores/auth-store';

type InfoSection = 'terms' | 'privacy' | 'mission' | 'services' | 'download' | 'cookies';

const content: Record<InfoSection, {
  eyebrow: string;
  title: string;
  subtitle: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  items: { title: string; body: string }[];
}> = {
  terms: {
    eyebrow: 'Pháp lý',
    title: 'Điều khoản sử dụng',
    subtitle: 'Các nguyên tắc giúp bạn sử dụng Timi minh bạch và an toàn.',
    icon: 'file-document-check-outline',
    items: [
      { title: 'Tài khoản của bạn', body: 'Bạn chịu trách nhiệm bảo vệ thông tin đăng nhập, PIN và thiết bị. Không chia sẻ OTP, PIN hoặc mật khẩu cho bất kỳ ai.' },
      { title: 'Xác nhận giao dịch', body: 'Luôn kiểm tra tên người nhận, số tài khoản và số tiền. Cảnh báo AI hỗ trợ quyết định nhưng không thay thế việc xác nhận của bạn.' },
      { title: 'Sử dụng hợp lệ', body: 'Không dùng Timi cho hành vi gian lận, truy cập trái phép hoặc gây tổn hại tới người dùng khác và hệ thống.' },
    ],
  },
  privacy: {
    eyebrow: 'Quyền riêng tư',
    title: 'Bảo mật dữ liệu',
    subtitle: 'Timi chỉ xử lý dữ liệu cần thiết để vận hành và bảo vệ tài khoản.',
    icon: 'shield-lock-outline',
    items: [
      { title: 'Dữ liệu tài khoản', body: 'Thông tin hồ sơ và giao dịch được dùng để cung cấp dịch vụ, phát hiện rủi ro và hỗ trợ bạn khi có sự cố.' },
      { title: 'Face ID', body: 'Ảnh chỉ được chụp khi bạn chủ động. Ứng dụng không lưu ảnh trong thư viện; máy chủ tạo mẫu xác minh phục vụ bảo mật.' },
      { title: 'Timi AI', body: 'Không gửi OTP, PIN hoặc mật khẩu vào chat. Lịch sử hội thoại có thể được lưu theo tài khoản để duy trì ngữ cảnh và có thể xóa trong màn hình AI.' },
    ],
  },
  mission: {
    eyebrow: 'Về Timi',
    title: 'Sứ mệnh của chúng tôi',
    subtitle: 'Giúp mỗi quyết định tài chính trở nên bình tĩnh, rõ ràng và an toàn hơn.',
    icon: 'shield-star-outline',
    items: [
      { title: 'An toàn từ thiết kế', body: 'Kiểm tra rủi ro, PIN, Face ID và cảnh báo được đặt đúng lúc trong hành trình giao dịch.' },
      { title: 'Minh bạch trước tiên', body: 'Timi giải thích vì sao một giao dịch cần thận trọng và đưa ra hành động cụ thể, dễ hiểu.' },
      { title: 'AI có trách nhiệm', body: 'AI hỗ trợ nhận diện dấu hiệu đáng ngờ; quyền quyết định và kiểm soát dữ liệu luôn thuộc về bạn.' },
    ],
  },
  services: {
    eyebrow: 'Khám phá',
    title: 'Dịch vụ trên Timi',
    subtitle: 'Một bộ công cụ bảo vệ tài chính trong cùng ứng dụng.',
    icon: 'apps',
    items: [
      { title: 'Chuyển tiền an toàn', body: 'Xác minh người nhận, chấm điểm rủi ro và yêu cầu PIN hoặc Face ID trước khi hoàn tất.' },
      { title: 'Timi AI & Guardian', body: 'Hỏi đáp tài chính, điều hướng tác vụ và phân tích transcript cuộc gọi để cảnh báo dấu hiệu lừa đảo.' },
      { title: 'Quét QR & lịch sử', body: 'Kiểm tra liên kết trước khi mở và theo dõi dòng tiền cùng mức độ an toàn của từng giao dịch.' },
    ],
  },
  download: {
    eyebrow: 'Ứng dụng',
    title: 'Timi Mobile',
    subtitle: 'Bạn đang sử dụng phiên bản Android được tối ưu cho thao tác an toàn.',
    icon: 'cellphone-check',
    items: [
      { title: 'Cập nhật ứng dụng', body: 'Chỉ cài APK từ đường dẫn build chính thức của dự án. Không cài file được gửi qua tin nhắn hoặc nguồn không xác định.' },
      { title: 'Quyền thiết bị', body: 'Camera chỉ cần cho QR và Face ID. Bạn có thể xem hoặc thu hồi quyền trong Cài đặt Android bất kỳ lúc nào.' },
      { title: 'Hỗ trợ', body: 'Nếu ứng dụng lỗi sau cập nhật, kiểm tra kết nối API rồi mở Timi AI để mô tả lỗi và nhận hướng dẫn.' },
    ],
  },
  cookies: {
    eyebrow: 'Dữ liệu cục bộ',
    title: 'Cookie và lưu trữ',
    subtitle: 'Trên ứng dụng, Timi dùng vùng lưu trữ bảo mật thay cho cookie trình duyệt.',
    icon: 'database-lock-outline',
    items: [
      { title: 'Phiên đăng nhập', body: 'Access token được giữ trong vùng bảo mật của hệ điều hành để khôi phục phiên khi bạn mở lại ứng dụng.' },
      { title: 'Dữ liệu tạm thời', body: 'Thông tin truy vấn được giữ ngắn hạn để màn hình tải nhanh hơn và sẽ được đồng bộ lại với máy chủ.' },
      { title: 'Kiểm soát của bạn', body: 'Đăng xuất sẽ kết thúc phiên trên ứng dụng. Bạn cũng có thể quản lý quyền camera trong Cài đặt Android.' },
    ],
  },
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default function InfoScreen() {
  const user = useAuthStore((state) => state.user);
  const params = useLocalSearchParams<{ section?: string }>();
  const key = firstParam(params.section) as InfoSection;
  const page = content[key] ?? content.services;

  return (
    <AppScreen>
      <PageHeader
        action={<RoundIconButton icon="close" onPress={() => router.back()} />}
        eyebrow={page.eyebrow}
        subtitle={page.subtitle}
        title={page.title}
      />

      <View style={styles.hero}>
        <View style={styles.heroOrb} />
        <View style={styles.heroIcon}><MaterialCommunityIcons color={colors.white} name={page.icon} size={38} /></View>
        <Text style={styles.heroTitle}>Rõ ràng. Riêng tư. An toàn.</Text>
        <Text style={styles.heroText}>Nội dung được trình bày ngắn gọn để bạn dễ kiểm tra ngay trên điện thoại.</Text>
      </View>

      <View style={styles.list}>
        {page.items.map((item, index) => (
          <Card key={item.title} style={styles.itemCard}>
            <View style={styles.index}><Text style={styles.indexText}>{index + 1}</Text></View>
            <View style={styles.itemText}>
              <Text style={styles.itemTitle}>{item.title}</Text>
              <Text style={styles.itemBody}>{item.body}</Text>
            </View>
          </Card>
        ))}
      </View>

      <InlineNotice message="Nếu cần giải thích thêm, Timi AI có thể hướng dẫn theo đúng tính năng bạn đang sử dụng." tone="blue" />
      <PrimaryButton
        icon="creation"
        label={user ? 'Hỏi Timi về nội dung này' : 'Đăng nhập để hỏi Timi'}
        onPress={() => user
          ? router.push({
              pathname: '/assistant',
              params: {
                context: page.eyebrow,
                prompt: `Hãy giải thích ngắn gọn cho tôi về ${page.title} và trả lời các câu hỏi tiếp theo.`,
                requestId: String(Date.now()),
              },
            })
          : router.replace('/')}
        variant="dark"
      />
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: colors.navy, borderRadius: 30, gap: spacing.sm, overflow: 'hidden', padding: spacing.xxl },
  heroOrb: { backgroundColor: colors.primary, borderRadius: 90, height: 160, opacity: 0.35, position: 'absolute', right: -50, top: -70, width: 160 },
  heroIcon: { alignItems: 'center', backgroundColor: '#FFFFFF18', borderRadius: radius.medium, height: 60, justifyContent: 'center', marginBottom: spacing.sm, width: 60 },
  heroTitle: { color: colors.white, fontSize: 20, fontWeight: '900' },
  heroText: { color: '#C8D5EE', fontSize: 13, lineHeight: 20, maxWidth: 320 },
  list: { gap: spacing.md },
  itemCard: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md, padding: spacing.lg },
  index: { alignItems: 'center', backgroundColor: colors.primarySoft, borderRadius: 14, height: 36, justifyContent: 'center', width: 36 },
  indexText: { color: colors.primary, fontSize: 13, fontWeight: '900' },
  itemText: { flex: 1, gap: spacing.sm },
  itemTitle: { color: colors.text, fontSize: 15, fontWeight: '900' },
  itemBody: { color: colors.textMuted, fontSize: 12, lineHeight: 19 },
});
