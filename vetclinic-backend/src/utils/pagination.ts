import { FastifyRequest, FastifyReply } from "fastify";

export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
}

export interface PaginationQuery {
  page?: string;
  limit?: string;
  search?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export function getPaginationParams(query: PaginationQuery): PaginationParams {
  const page = Math.max(1, parseInt(query.page || "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit || "20", 10) || 20));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

export function paginatedResponse<T>(data: T[], total: number, page: number, limit: number): PaginatedResult<T> {
  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export function searchFilter(search: string | undefined, fields: string[]) {
  if (!search || !search.trim()) return {};
  const term = search.trim();
  return {
    OR: fields.map((field) => ({ [field]: { contains: term, mode: "insensitive" as const } })),
  };
}
