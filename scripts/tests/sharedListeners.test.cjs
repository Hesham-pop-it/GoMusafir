const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../../src/services/sharedListeners.js'), 'utf8')
    .replace(/^import .*;\n/gm, '').replace(/export /g, '');

function fixture(linger = 0) {
    const context = { console, setTimeout, clearTimeout, onValue: () => {}, ref: () => {}, database: {} };
    vm.createContext(context);
    vm.runInContext(source, context);
    const attached = [], detached = [];
    const pushes = {};
    const shared = context.createSharedListeners((key, make, onVal, onError) => {
        attached.push(key);
        pushes[key] = { onVal, onError };
        return () => detached.push(key);
    }, { linger });
    return { shared, attached, detached, pushes };
}

test('two subscribers on one path open one listener and both get every value', () => {
    const f = fixture();
    const a = [], b = [];
    f.shared.watch('p', () => {}, v => a.push(v));
    f.shared.watch('p', () => {}, v => b.push(v));
    f.pushes.p.onVal(1);
    f.pushes.p.onVal(2);
    assert.deepEqual(f.attached, ['p']);
    assert.deepEqual(a, [1, 2]);
    assert.deepEqual(b, [1, 2]);
});

test('a late subscriber gets the latest value without a second download', () => {
    const f = fixture();
    f.shared.watch('p', () => {}, () => {});
    f.pushes.p.onVal({ x: 1 });
    const late = [];
    f.shared.watch('p', () => {}, v => late.push(v));
    assert.deepEqual(late, [{ x: 1 }]);
    assert.equal(f.attached.length, 1);
});

test('the listener closes only when the last subscriber leaves', () => {
    const f = fixture();
    const u1 = f.shared.watch('p', () => {}, () => {});
    const u2 = f.shared.watch('p', () => {}, () => {});
    u1(); u1();
    assert.deepEqual(f.detached, []);
    u2();
    assert.deepEqual(f.detached, ['p']);
    assert.equal(f.shared.size(), 0);
});

test('distinct paths get distinct listeners', () => {
    const f = fixture();
    f.shared.watch('a', () => {}, () => {});
    f.shared.watch('b', () => {}, () => {});
    assert.deepEqual(f.attached, ['a', 'b']);
});

test('a refused listener reports to everyone and the next subscriber reopens it', () => {
    const f = fixture();
    const errors = [];
    f.shared.watch('p', () => {}, () => {}, e => errors.push(e));
    f.shared.watch('p', () => {}, () => {}, e => errors.push(e));
    f.pushes.p.onError('denied');
    assert.deepEqual(errors, ['denied', 'denied']);
    f.shared.watch('p', () => {}, () => {});
    assert.deepEqual(f.attached, ['p', 'p']);
});

test('a screen swap inside the linger window keeps the listener open', async () => {
    const f = fixture(30);
    const u = f.shared.watch('p', () => {}, () => {});
    u();
    f.shared.watch('p', () => {}, () => {});
    await new Promise(r => setTimeout(r, 60));
    assert.deepEqual(f.detached, []);
    assert.equal(f.attached.length, 1);
});

test('the listener closes after the linger when nobody returns', async () => {
    const f = fixture(20);
    f.shared.watch('p', () => {}, () => {})();
    await new Promise(r => setTimeout(r, 60));
    assert.deepEqual(f.detached, ['p']);
});

test('one failing subscriber does not starve the others', () => {
    const f = fixture();
    const got = [];
    f.shared.watch('p', () => {}, () => { throw new Error('boom'); });
    f.shared.watch('p', () => {}, v => got.push(v));
    f.pushes.p.onVal(7);
    assert.deepEqual(got, [7]);
});
