// This is a general template. I think it works for most cases
export interface PaginatedResult<T> {
  data: T[];
  metadata: {
    totalItems: number;
    itemsOnCurrentPage: number;
    currentPage: number;
    itemsPerPage: number;
    totalPages: number;
  }
}
