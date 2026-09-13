import { useCallback, useEffect, useRef, useState } from "react";

import { useAppNavigation, useNavigationLocation } from "~/navigation/hooks";
import { isMapPath, parsePhotoId } from "~/navigation/routes";

import { useCommandPaletteShortcut } from "./useCommandPaletteShortcut";

interface PhotoReturn {
  originKey: string;
  enteredPhoto: boolean;
}

/** Retains the search UI for this app instance and resumes a photo round trip. */
export function useCommandPaletteSession() {
  const { isOpen, setIsOpen } = useCommandPaletteShortcut();
  const navigation = useAppNavigation();
  const location = useNavigationLocation();
  const [hasOpened, setHasOpened] = useState(false);
  const [isOpeningPhoto, setIsOpeningPhoto] = useState(false);
  const photoReturnRef = useRef<PhotoReturn | null>(null);
  const previousLocationKeyRef = useRef(location.key);

  useEffect(
    () =>
      navigation.subscribe(() => {
        const photoReturn = photoReturnRef.current;
        if (!photoReturn) return;

        // Observe every committed navigation, including consecutive steps that
        // React may batch. A close animation only changes presentation state.
        if (navigation.isPhotoOpen()) {
          photoReturn.enteredPhoto = true;
        } else if (navigation.getLocation().key !== photoReturn.originKey) {
          // A different entry, even with the same URL, is a new browsing intent.
          photoReturnRef.current = null;
        }
      }),
    [navigation],
  );

  useEffect(() => {
    const enteredNewPhoto =
      previousLocationKeyRef.current !== location.key &&
      parsePhotoId(location.pathname) !== null;
    previousLocationKeyRef.current = location.key;

    if (isOpen) {
      setHasOpened(true);
      photoReturnRef.current = null;
      setIsOpeningPhoto(enteredNewPhoto);
      // Browser Forward or a new photo link should reveal the viewer. Opening
      // search deliberately on the unchanged photo entry remains available.
      if (enteredNewPhoto) setIsOpen(false);
      return;
    }

    const photoReturn = photoReturnRef.current;
    if (
      photoReturn?.enteredPhoto &&
      location.key === photoReturn.originKey &&
      parsePhotoId(location.pathname) === null
    ) {
      // Wait for the route render to commit before acquiring the modal again;
      // isPhotoPresented becomes false while the outgoing viewer still exists.
      photoReturnRef.current = null;
      setIsOpeningPhoto(false);
      setIsOpen(true);
    }
  }, [isOpen, location, setIsOpen]);

  const onClose = useCallback(() => {
    photoReturnRef.current = null;
    setIsOpeningPhoto(false);
    setIsOpen(false);
  }, [setIsOpen]);

  const onPhotoOpen = useCallback(() => {
    const origin = navigation.getLocation();
    photoReturnRef.current =
      origin.pathname === "/" || isMapPath(origin.pathname)
        ? { originKey: origin.key, enteredPhoto: false }
        : null;
    setIsOpeningPhoto(true);
    setIsOpen(false);
  }, [navigation, setIsOpen]);

  return {
    isOpen,
    shouldMount: isOpen || hasOpened,
    onClose,
    onPhotoOpen,
    restoreFocusOnClose: !isOpeningPhoto,
  };
}
