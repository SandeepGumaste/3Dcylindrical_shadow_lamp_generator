declare module 'cdt2d' {
  interface Options {
    delaunay?: boolean;
    interior?: boolean;
    exterior?: boolean;
  }
  export default function cdt2d(
    points: [number, number][],
    edges?: [number, number][],
    options?: Options
  ): [number, number, number][];
}
