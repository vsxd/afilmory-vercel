import { ErrorBoundary } from "react-error-boundary";

import { MapErrorState } from "~/components/ui/map";
import { MapSection } from "~/modules/map/MapSection";

export const Component = () => {
  return (
    <ErrorBoundary fallback={<MapErrorState />}>
      <MapSection />
    </ErrorBoundary>
  );
};
