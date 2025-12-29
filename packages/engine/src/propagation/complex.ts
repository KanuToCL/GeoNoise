export type Complex = { re: number; im: number };

export function complex(re: number, im: number): Complex {
  return { re, im };
}

export function complexAdd(a: Complex, b: Complex): Complex {
  return { re: a.re + b.re, im: a.im + b.im };
}

export function complexSub(a: Complex, b: Complex): Complex {
  return { re: a.re - b.re, im: a.im - b.im };
}

export function complexMul(a: Complex, b: Complex): Complex {
  return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re };
}

export function complexDiv(a: Complex, b: Complex): Complex {
  const denom = b.re * b.re + b.im * b.im;
  if (denom === 0) return { re: 0, im: 0 };
  return {
    re: (a.re * b.re + a.im * b.im) / denom,
    im: (a.im * b.re - a.re * b.im) / denom,
  };
}

export function complexAbs(a: Complex): number {
  return Math.sqrt(a.re * a.re + a.im * a.im);
}

export function complexSqrt(a: Complex): Complex {
  const r = complexAbs(a);
  if (r === 0) return { re: 0, im: 0 };
  const t = Math.sqrt((r + a.re) / 2);
  const u = Math.sqrt((r - a.re) / 2);
  return { re: t, im: a.im < 0 ? -u : u };
}

export function complexExpj(phi: number): Complex {
  return { re: Math.cos(phi), im: Math.sin(phi) };
}

export function complexScale(a: Complex, scalar: number): Complex {
  return { re: a.re * scalar, im: a.im * scalar };
}
