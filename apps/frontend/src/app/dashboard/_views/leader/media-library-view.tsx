// Private dashboard view wrapper for the media library.
'use client';

import { MediaLibraryManager } from '../../_components/leader/media-library-manager';

export default function MediaLibraryView() {
  return (
    <div className="space-y-8">
      <MediaLibraryManager />
    </div>
  );
}
