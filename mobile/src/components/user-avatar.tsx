import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/constants/theme';
import { initials } from '@/utils/format';

export function UserAvatar({
  name,
  uri,
  size = 48,
  dark = false,
}: {
  name?: string | null;
  uri?: string | null;
  size?: number;
  dark?: boolean;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const imageUri = uri?.trim();
  const showImage = Boolean(imageUri) && !imageFailed;

  return (
    <View
      style={[
        styles.avatar,
        {
          backgroundColor: dark ? colors.primary : colors.primarySoft,
          borderRadius: size * 0.32,
          height: size,
          width: size,
        },
      ]}>
      {showImage ? (
        <Image
          accessibilityLabel={`Ảnh đại diện của ${name || 'người dùng'}`}
          onError={() => setImageFailed(true)}
          source={{ uri: imageUri }}
          style={{ borderRadius: size * 0.32, height: size, width: size }}
        />
      ) : (
        <Text style={[styles.initials, { color: dark ? colors.white : colors.primaryDark, fontSize: Math.max(12, size * 0.28) }]}>
          {initials(name)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  initials: { fontWeight: '900' },
});
