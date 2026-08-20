// Shared image-attachment helper (§161 — Apple review feedback).
// Every place that attaches a photo must offer BOTH sources: take a new photo
// with the camera, or choose one from the photo library — each behind its own
// OS permission prompt. Used by NewTaskScreen, MyHubScreen and ExpensesScreen.
import { Alert, ActionSheetIOS, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

export type PickedImage = { uri: string; name: string; type: string };

type PickOptions = {
  quality?: number;
  allowsEditing?: boolean;
  namePrefix?: string;
};

type Translate = (key: string) => string;

async function pickFrom(
  source: 'camera' | 'library',
  t: Translate,
  opts: PickOptions
): Promise<PickedImage | null> {
  try {
    if (source === 'camera') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(t('common.error'), t('common.cameraPermission'));
        return null;
      }
    } else {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(t('common.error'), t('common.photoPermission'));
        return null;
      }
    }

    const args = {
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: opts.allowsEditing ?? false,
      quality: opts.quality ?? 0.7,
    };
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(args)
        : await ImagePicker.launchImageLibraryAsync(args);

    if (result.canceled || !result.assets?.length) return null;
    const asset = result.assets[0];
    return {
      uri: asset.uri,
      name: asset.fileName || `${opts.namePrefix || 'photo'}_${Date.now()}.jpg`,
      type: asset.mimeType || 'image/jpeg',
    };
  } catch {
    return null;
  }
}

/**
 * Ask the user where the photo comes from (camera or library), then pick.
 * Resolves to null when the user cancels or a permission is denied.
 */
export function pickImageWithSource(t: Translate, opts: PickOptions = {}): Promise<PickedImage | null> {
  return new Promise((resolve) => {
    const done = (p: Promise<PickedImage | null>) => p.then(resolve);
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [t('common.takePhoto'), t('common.chooseFromLibrary'), t('common.cancel')],
          cancelButtonIndex: 2,
        },
        (index) => {
          if (index === 0) done(pickFrom('camera', t, opts));
          else if (index === 1) done(pickFrom('library', t, opts));
          else resolve(null);
        }
      );
    } else {
      Alert.alert(t('common.addPhoto'), undefined, [
        { text: t('common.takePhoto'), onPress: () => done(pickFrom('camera', t, opts)) },
        { text: t('common.chooseFromLibrary'), onPress: () => done(pickFrom('library', t, opts)) },
        { text: t('common.cancel'), style: 'cancel', onPress: () => resolve(null) },
      ]);
    }
  });
}
