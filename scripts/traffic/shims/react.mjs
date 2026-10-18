// Minimal hooks so a data hook such as useVisibilityRevision can run outside a
// component: the effect runs once at mount, state updates are dropped.
export function useState(initial) { return [typeof initial === 'function' ? initial() : initial, () => {}]; }
export function useEffect(effect) { effect(); }
export function useRef(initial) { return { current: initial }; }
export function useCallback(fn) { return fn; }
export function useMemo(fn) { return fn(); }
export default { useState, useEffect, useRef, useCallback, useMemo };
