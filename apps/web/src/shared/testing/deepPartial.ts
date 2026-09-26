/**
 * Partial all the way down.
 *
 * Test fixtures for a store or an API payload are partial by nature: a test
 * about one field supplies that field. Writing them as `as any` gave that up
 * entirely — names and types stopped being checked along with presence. This
 * gives up presence only.
 */
export type DeepPartial<T> = T extends (...args: never[]) => unknown
    ? T
    : T extends Date | File | Blob
    ? T
    : T extends Array<infer U>
    ? Array<DeepPartial<U>>
    : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T
