const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const babel = require('@babel/core');

// Use the actual serialized layouts and extension runtime. A Babel-only check
// cannot catch a gallery entry registered under a Live Activity's storage key.
const widgets = new Map();
const activities = new Map();
const { code } = babel.transformFileSync(require.resolve('../../src/components/Widget.js'), {
    caller: { name: 'metro', platform: 'ios' },
});
vm.runInNewContext(code, {
    exports: {},
    require: name => name === 'expo-widgets' ? {
        createWidget: (name, layout) => widgets.set(name, layout),
        createLiveActivity: (name, layout) => activities.set(name, layout),
    } : {},
});
const runtime = fs.readFileSync(require.resolve('expo-widgets/package.json').replace('package.json', 'bundle/build/ExpoWidgets.bundle'), 'utf8');
const config = require('../../app.json').expo.plugins.find(p => Array.isArray(p) && p[0] === 'expo-widgets')[1];

test('lock-screen card shows idle speaker and disables disconnected mute controls', () => {
    const context = vm.createContext({ console });
    vm.runInContext(runtime, context);
    context.__expoWidgetLayout = vm.runInContext(`(${activities.get('MyLiveActivity')})`, context);
    context.props = { isAdmin: true, isConnected: false, isSpeaking: false,
        activeSpeakerName: 'Previous speaker', activeChannelName: 'Umrah Tour', participantCount: 24 };
    const banner = vm.runInContext('__expoWidgetRender(props, {}).banner', context);
    const text = JSON.stringify(banner);
    assert.ok(text.includes('No Active Speaker'));
    assert.ok(!text.includes('Previous speaker'));
    assert.ok(text.includes('Start Voice'));
    const buttons = [];
    const visit = node => {
        if (!node || typeof node !== 'object') return;
        if (node.props?.target) buttons.push(node);
        Object.values(node).forEach(visit);
    };
    visit(banner);
    for (const target of ['mute_myself', 'mute_channel']) {
        const button = buttons.find(node => node.props.target === target);
        assert.ok(button?.props.modifiers.some(modifier => modifier.disabled === true));
    }
    context.props.isSpeaking = true;
    context.props.isConnected = true;
    const speaking = JSON.stringify(vm.runInContext('__expoWidgetRender(props, {}).banner', context));
    assert.ok(speaking.includes('Previous speaker'));
    assert.ok(!speaking.includes('No Active Speaker'));
});

test('microphone icons change on unmute even before anyone speaks', () => {
    const context = vm.createContext({ console });
    vm.runInContext(runtime, context);
    for (const layout of [widgets.get('MyWidget'), activities.get('MyLiveActivity')]) {
        context.__expoWidgetLayout = vm.runInContext(`(${layout})`, context);
        const render = isMuted => {
            context.widgetProps = { isConnected: true, isMuted, isSpeaking: false };
            return vm.runInContext('__expoWidgetRender(widgetProps, {})', context);
        };
        const images = node => {
            if (!node || typeof node !== 'object') return [];
            return [node.props?.systemName, node.props?.systemImage, ...Object.values(node).flatMap(images)].filter(Boolean);
        };
        const muted = render(true);
        const unmuted = render(false);
        assert.ok(images(muted.banner || muted).includes('mic.slash.fill'));
        assert.ok(images(unmuted.banner || unmuted).includes('mic.fill'));
        assert.ok(!images(unmuted.banner || unmuted).includes('mic.slash.fill'));
        if (unmuted.compactTrailing) {
            assert.ok(images(unmuted.compactTrailing).includes('mic.fill'));
        }
    }
});

test('every iOS gallery entry has a Home Screen layout, not just a Live Activity', () => {
    for (const widget of config.widgets.filter(w => w.ios !== null)) {
        assert.ok(widgets.has(widget.name), `${widget.name} has no Home Screen layout`);
    }
    assert.ok(activities.has('MyLiveActivity'), 'Lock Screen activity remains registered');
});

test('journey widget renders empty and active states in the extension runtime', () => {
    const context = vm.createContext({ console });
    vm.runInContext(runtime, context);
    context.__expoWidgetLayout = vm.runInContext(`(${widgets.get('MyWidget')})`, context);
    for (const props of [{}, {
        tripId: 'trip-1', orgId: 'org-1', activeChannelName: 'Umrah Tour',
        isConnected: true, isChannelActive: true, isSpeaking: true,
        activeSpeakerName: 'Abdullah', activeSpeakerAvatar: 'file:///shared/avatar.jpg',
        activeChannelImageURL: 'file:///shared/trip.jpg', widgetLogoURL: 'file:///shared/logo.png',
        participantCount: 24,
    }]) {
        context.widgetProps = props;
        const result = vm.runInContext('__expoWidgetRender(widgetProps, { widgetFamily: "systemMedium" })', context);
        assert.equal(result.type, 'HStackView');
        const rendered = JSON.stringify(result);
        const visit = node => {
            if (!node || typeof node !== 'object') return;
            for (const modifier of node.props?.modifiers || []) {
                assert.ok(!(modifier.height !== undefined && modifier.maxWidth !== undefined),
                    'fixed height and flexible width must use separate native frame modifiers');
            }
            Object.values(node).forEach(visit);
        };
        visit(result);
        assert.ok(rendered.includes('Open Voice'));
        assert.ok(rendered.includes('Open Map'));
        if (props.tripId) {
            assert.ok(rendered.includes('gomusafir://voicechat?tripId=trip-1'));
            assert.ok(rendered.includes('&autoStart=true'));
            assert.ok(!rendered.includes('&isAdmin='), 'cached widget role must not control admission');
            assert.ok(rendered.includes('Abdullah'));
        } else {
            assert.ok(rendered.includes('gomusafir://voicechat?autoStart=true'));
        }
    }
});

test('voice controls use the resolved trip role instead of a stale widget hint', () => {
    const roleSource = fs.readFileSync(require.resolve('../../src/utils/voiceRole.js'), 'utf8');
    const isVoiceStaff = vm.runInNewContext(roleSource.replace('export const', 'const') + '\nisVoiceStaff');
    const ast = babel.parseSync(fs.readFileSync(require.resolve('../../src/screens/trip/VoiceChatScreen.js'), 'utf8'), {
        configFile: false, babelrc: false, parserOpts: { plugins: ['jsx'] },
    });
    let expression;
    babel.traverse(ast, { VariableDeclarator(path) {
        if (path.node.id.name === 'isAdminState') expression = require('@babel/generator').default(path.node.init).code;
    } });
    assert.ok(expression);
    const state = {
        isConnected: true, activeTripId: 'trip', tripId: 'trip', voiceIsAdmin: true,
        isAdmin: false, staffLoadedFor: null, roleKey: 'org/trip', staffData: {},
        auth: { currentUser: { uid: 'me' } }, isVoiceStaff,
    };
    const renderRole = () => vm.runInNewContext(expression, state);
    assert.equal(renderRole(), true, 'connected admin overrides old false hint');
    state.voiceIsAdmin = false;
    state.isAdmin = true;
    assert.equal(renderRole(), false, 'connected participant overrides old true hint');
    state.isConnected = false;
    state.staffLoadedFor = state.roleKey;
    for (const role of ['admin', 'co-host', 'manager', 'participant', null]) {
        state.staffData.me = role;
        assert.equal(renderRole(), ['admin', 'co-host', 'manager'].includes(role));
    }
});

test('widget auto-start connects once even while channel status is unknown', () => {
    // Execute the screen's actual effect with deep-link values, without native UI.
    const ast = babel.parseSync(fs.readFileSync(require.resolve('../../src/screens/trip/VoiceChatScreen.js'), 'utf8'), {
        configFile: false, babelrc: false, parserOpts: { plugins: ['jsx'] },
    });
    let callback;
    babel.traverse(ast, {
        CallExpression(path) {
            if (path.node.callee.name !== 'useEffect') return;
            const candidate = path.node.arguments[0];
            if (candidate?.body?.body?.some(statement =>
                statement.type === 'VariableDeclaration' && statement.declarations.some(d => d.id.name === 'wantsAutoStart'))) {
                callback = require('@babel/generator').default(candidate).code;
            }
        },
    });
    assert.ok(callback, 'auto-start effect exists');
    const calls = [];
    const context = vm.createContext({
        autoStart: 'true', isConnected: false, loading: false,
        isChannelActive: null, isAdminState: false, isAdmin: false,
        tripId: 'trip-1', orgId: 'org-1', hasAutoStarted: { current: false },
        handleConnect: role => calls.push(role),
    });
    const run = () => vm.runInContext(`(${callback})()`, context);
    run();
    run();
    assert.deepEqual(calls, [false], 'request admission without waiting; do not retry on rerender');
    for (const overrides of [{ autoStart: 'false' }, { loading: true }, { tripId: '' }, { isConnected: true }]) {
        Object.assign(context, { autoStart: true, loading: false, tripId: 'trip-1', isConnected: false }, overrides);
        context.hasAutoStarted.current = false;
        run();
    }
    assert.equal(calls.length, 1);
});
