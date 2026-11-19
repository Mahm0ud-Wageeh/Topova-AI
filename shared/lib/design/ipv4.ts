const IPV4_LIMIT = 2 ** 32;

export function parseAddress(address: string): number | null {
  const octets = address.split(".");
  if (octets.length !== 4 || octets.some((octet) =>
    !/^(0|[1-9]\d{0,2})$/.test(octet) || Number(octet) > 255,
  )) return null;
  return octets.reduce((value, octet) => value * 256 + Number(octet), 0);
}

export function blockSize(endpointAddresses: number, minimumPrefix?: number) {
  return Math.max(2 ** Math.ceil(Math.log2(endpointAddresses + 3)),
    minimumPrefix === undefined ? 0 : 2 ** (32 - minimumPrefix));
}

export function formatAddress(value: number): string {
  if (!Number.isInteger(value) || value < 0 || value >= IPV4_LIMIT) {
    throw new RangeError("IPv4 address is out of bounds.");
  }
  return [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join(".");
}

export function parseCidr(cidr: string) {
  const [address, rawPrefix, extra] = cidr.split("/");
  if (!rawPrefix || extra !== undefined || !/^(0|[1-9]\d?)$/.test(rawPrefix)) return null;
  const prefix = Number(rawPrefix);
  const start = parseAddress(address);
  if (start === null || prefix > 32) return null;
  const size = 2 ** (32 - prefix);
  if (start % size !== 0) return null;
  return { start, size, prefix, end: start + size - 1 };
}
