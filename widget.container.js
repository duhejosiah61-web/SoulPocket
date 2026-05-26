import { LayoutConfig, createWidgetStyle, mergeStyles } from './layout.config.js';

export function useWidgetContainer() {
    const widgets = new Map();
    const listeners = new Set();

    function register(id, config) {
        widgets.set(id, {
            id,
            config,
            style: createWidgetStyle(config),
        });
        notifyListeners();
        return widgets.get(id);
    }

    function unregister(id) {
        widgets.delete(id);
        notifyListeners();
    }

    function update(id, updates) {
        const widget = widgets.get(id);
        if (widget) {
            widget.config = { ...widget.config, ...updates };
            widget.style = createWidgetStyle(widget.config);
            notifyListeners();
        }
        return widget;
    }

    function get(id) {
        return widgets.get(id);
    }

    function getStyle(id) {
        const widget = widgets.get(id);
        return widget ? widget.style : {};
    }

    function getAll() {
        return Array.from(widgets.values());
    }

    function subscribe(callback) {
        listeners.add(callback);
        return () => listeners.delete(callback);
    }

    function notifyListeners() {
        listeners.forEach(callback => callback(getAll()));
    }

    function applyPreset(presetName) {
        const preset = LayoutConfig[presetName];
        if (preset) {
            Object.entries(preset).forEach(([key, config]) => {
                register(`${presetName}.${key}`, config);
            });
        }
    }

    function createLayout(widgets) {
        const layout = {};
        Object.entries(widgets).forEach(([id, config]) => {
            layout[id] = register(id, config);
        });
        return layout;
    }

    return {
        register,
        unregister,
        update,
        get,
        getStyle,
        getAll,
        subscribe,
        applyPreset,
        createLayout,
        config: LayoutConfig,
    };
}

export function createContainer(id, baseConfig = {}) {
    return {
        id,
        ...baseConfig,
        children: [],
        
        addChild(childId, childConfig) {
            this.children.push({
                id: childId,
                ...childConfig,
            });
            return this;
        },
        
        setPadding(padding) {
            this.padding = padding;
            return this;
        },
        
        setMargin(margin) {
            this.margin = margin;
            return this;
        },
        
        setPosition(position) {
            this.position = position;
            return this;
        },
        
        setSize(width, height) {
            this.width = width;
            this.height = height;
            return this;
        },
        
        setFlex(flex) {
            this.flex = flex;
            return this;
        },
        
        setOverflow(overflow) {
            this.overflow = overflow;
            return this;
        },
        
        setZIndex(zIndex) {
            this.zIndex = zIndex;
            return this;
        },
        
        build() {
            return {
                id: this.id,
                config: {
                    position: this.position,
                    top: this.top,
                    bottom: this.bottom,
                    left: this.left,
                    right: this.right,
                    width: this.width,
                    height: this.height,
                    padding: this.padding,
                    margin: this.margin,
                    flex: this.flex,
                    overflow: this.overflow,
                    zIndex: this.zIndex,
                    display: this.display,
                    flexDirection: this.flexDirection,
                    gap: this.gap,
                    transform: this.transform,
                },
                children: this.children,
            };
        },
    };
}

export const WidgetPresets = {
    homeScreen: {
        container: {
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            paddingTop: 'calc(12% + env(safe-area-inset-top))',
            paddingBottom: 'calc(25% + env(safe-area-inset-bottom))',
        },
        statusBar: {
            position: 'fixed',
            top: '0',
            left: '0',
            right: '0',
            height: '44px',
            paddingTop: 'env(safe-area-inset-top)',
            zIndex: 100,
        },
        dock: {
            position: 'fixed',
            bottom: 'calc(3% + env(safe-area-inset-bottom))',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 50,
        },
    },
    
    appPage: {
        container: {
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
        },
        header: {
            width: '100%',
            flexShrink: '0',
            paddingTop: 'calc(10% + env(safe-area-inset-top))',
            paddingBottom: '4%',
        },
        content: {
            width: '100%',
            flex: '1',
            overflowY: 'auto',
            paddingBottom: 'calc(5% + env(safe-area-inset-bottom))',
        },
    },
    
    chat: {
        container: {
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
        },
        header: {
            width: '100%',
            flexShrink: '0',
            paddingTop: 'calc(10% + env(safe-area-inset-top))',
            paddingBottom: '3%',
        },
        messages: {
            width: '100%',
            flex: '1',
            overflowY: 'auto',
            paddingBottom: 'calc(18% + env(safe-area-inset-bottom))',
        },
        input: {
            position: 'fixed',
            bottom: '0',
            left: '0',
            right: '0',
            paddingBottom: 'calc(4% + env(safe-area-inset-bottom))',
            zIndex: 100,
        },
    },
    
    bottomNav: {
        position: 'fixed',
        bottom: '0',
        left: '0',
        right: '0',
        paddingBottom: 'calc(3% + env(safe-area-inset-bottom))',
        zIndex: 100,
    },
    
    card: {
        width: '100%',
        flexShrink: '0',
        marginBottom: '5%',
        padding: '5%',
        overflow: 'visible',
    },
    
    modal: {
        overlay: {
            position: 'fixed',
            top: '0',
            left: '0',
            right: '0',
            bottom: '0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 200,
        },
        content: {
            width: '90%',
            maxWidth: '400px',
            maxHeight: '80%',
            borderRadius: '16px',
            overflow: 'hidden',
        },
    },
};

export function applyWidgetPreset(presetName, overrides = {}) {
    const preset = WidgetPresets[presetName];
    if (!preset) return {};
    
    if (preset.position || preset.width || preset.height) {
        return { ...preset, ...overrides };
    }
    
    return Object.fromEntries(
        Object.entries(preset).map(([key, config]) => [
            key,
            { ...config, ...(overrides[key] || {}) }
        ])
    );
}
