import { NavigationItem, NavigationItemStatus } from "../connection/connectionModels";

const getNavigationStatusPriority = (status: NavigationItemStatus): number => {
  if (status === "pending") {
    return 0;
  }
  if (status === "waiting") {
    return 1;
  }
  if (status === "active") {
    return 2;
  }
  return 3;
};

export const compareNavigationItems = (left: NavigationItem, right: NavigationItem): number => {
  const leftPriority = getNavigationStatusPriority(left.status);
  const rightPriority = getNavigationStatusPriority(right.status);
  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority;
  }

  // Keep the ordering total and consistent with Firestore paging:
  // primary sort bucket ascending, then listSortAt descending.
  if (left.sortBucket !== right.sortBucket) {
    return left.sortBucket - right.sortBucket;
  }

  if (left.listSortAtMs !== right.listSortAtMs) {
    return right.listSortAtMs - left.listSortAtMs;
  }

  return left.id.localeCompare(right.id);
};
