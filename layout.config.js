export const LayoutConfig = {
    safeArea: {
        top: 'env(safe-area-inset-top)',
        bottom: 'env(safe-area-inset-bottom)',
        left: 'env(safe-area-inset-left)',
        right: 'env(safe-area-inset-right)',
    },

    homeScreen: {
        container: {
            width: '100%',
            height: '100%',
            paddingTop: 'calc(12% + env(safe-area-inset-top))',
            paddingBottom: 'calc(25% + env(safe-area-inset-bottom))',
            paddingLeft: '5%',
            paddingRight: '5%',
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
        heroSection: {
            width: '100%',
            height: 'auto',
            minHeight: '30%',
            paddingTop: '8%',
        },
        appGrid: {
            width: '100%',
            height: 'auto',
            minHeight: '40%',
            gap: '3%',
            gridColumns: 'repeat(4, 1fr)',
        },
        dock: {
            position: 'fixed',
            bottom: 'calc(3% + env(safe-area-inset-bottom))',
            left: '50%',
            transform: 'translateX(-50%)',
            height: 'auto',
            padding: '4% 8%',
            gap: '6%',
            zIndex: 50,
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
            paddingLeft: '5%',
            paddingRight: '5%',
            borderBottom: '2px solid rgba(0,0,0,0.15)',
        },
        messages: {
            width: '100%',
            flex: '1',
            overflowY: 'auto',
            padding: '5%',
            paddingBottom: 'calc(20% + env(safe-area-inset-bottom))',
        },
        input: {
            position: 'fixed',
            bottom: '0',
            left: '0',
            right: '0',
            paddingTop: '3%',
            paddingBottom: 'calc(4% + env(safe-area-inset-bottom))',
            paddingLeft: '5%',
            paddingRight: '5%',
            zIndex: 100,
        },
    },

    call: {
        container: {
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            paddingTop: 'env(safe-area-inset-top)',
            paddingBottom: 'env(safe-area-inset-bottom)',
        },
        header: {
            width: '100%',
            flexShrink: '0',
            paddingTop: '8%',
            textAlign: 'center',
        },
        avatar: {
            width: '100%',
            flex: '1',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
        },
        messages: {
            width: '100%',
            maxHeight: '25%',
            overflowY: 'auto',
            padding: '4%',
        },
        controls: {
            width: '100%',
            flexShrink: '0',
            paddingTop: '4%',
            paddingBottom: 'calc(5% + env(safe-area-inset-bottom))',
        },
    },

    hub: {
        container: {
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
        },
        header: {
            width: '100%',
            flexShrink: '0',
            paddingTop: 'calc(3% + env(safe-area-inset-top))',
            paddingBottom: '3%',
            paddingLeft: '4%',
            paddingRight: '4%',
        },
        posts: {
            width: '100%',
            flex: '1',
            overflowY: 'auto',
            paddingBottom: 'calc(18% + env(safe-area-inset-bottom))',
        },
        bottomNav: {
            position: 'fixed',
            bottom: '0',
            left: '0',
            right: '0',
            paddingTop: '3%',
            paddingBottom: 'calc(3% + env(safe-area-inset-bottom))',
            zIndex: 100,
        },
    },

    workshop: {
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
            paddingLeft: '5%',
            paddingRight: '5%',
        },
        content: {
            width: '100%',
            flex: '1',
            overflowY: 'auto',
            padding: '5%',
            paddingBottom: 'calc(5% + env(safe-area-inset-bottom))',
        },
        card: {
            width: '100%',
            flexShrink: '0',
            marginBottom: '5%',
            padding: '5%',
            overflow: 'visible',
        },
    },

    console: {
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
            paddingLeft: '5%',
            paddingRight: '5%',
        },
        content: {
            width: '100%',
            flex: '1',
            overflowY: 'auto',
            padding: '5%',
            paddingBottom: 'calc(5% + env(safe-area-inset-bottom))',
        },
        card: {
            width: '100%',
            flexShrink: '0',
            marginBottom: '5%',
            padding: '5%',
        },
    },

    theme: {
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
            paddingLeft: '5%',
            paddingRight: '5%',
        },
        content: {
            width: '100%',
            flex: '1',
            overflowY: 'auto',
            padding: '5%',
            paddingBottom: 'calc(5% + env(safe-area-inset-bottom))',
        },
        card: {
            width: '100%',
            flexShrink: '0',
            marginBottom: '5%',
            padding: '5%',
        },
    },

    mate: {
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
            paddingLeft: '5%',
            paddingRight: '5%',
        },
        content: {
            width: '100%',
            flex: '1',
            overflowY: 'auto',
            padding: '5%',
            paddingBottom: 'calc(5% + env(safe-area-inset-bottom))',
        },
        card: {
            width: '100%',
            flexShrink: '0',
            marginBottom: '5%',
            padding: '5%',
        },
    },

    feed: {
        container: {
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
        },
        header: {
            width: '100%',
            flexShrink: '0',
            paddingTop: 'calc(8% + env(safe-area-inset-top))',
            paddingBottom: '4%',
            paddingLeft: '5%',
            paddingRight: '5%',
        },
        content: {
            width: '100%',
            flex: '1',
            overflowY: 'auto',
            paddingBottom: 'calc(15% + env(safe-area-inset-bottom))',
        },
        fab: {
            position: 'fixed',
            bottom: 'calc(12% + env(safe-area-inset-bottom))',
            right: '5%',
            width: '56px',
            height: '56px',
            zIndex: 50,
        },
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

    breakpoints: {
        xs: '360px',
        sm: '480px',
        md: '768px',
        lg: '1024px',
    },

    spacing: {
        xs: '2%',
        sm: '3%',
        md: '4%',
        lg: '5%',
        xl: '6%',
    },

    fontSize: {
        xs: '12px',
        sm: '13px',
        md: '14px',
        lg: '16px',
        xl: '18px',
        xxl: '24px',
    },
};

export function createWidgetStyle(widget) {
    const style = {};
    
    if (widget.position) {
        style.position = widget.position;
    }
    if (widget.top) style.top = widget.top;
    if (widget.bottom) style.bottom = widget.bottom;
    if (widget.left) style.left = widget.left;
    if (widget.right) style.right = widget.right;
    if (widget.width) style.width = widget.width;
    if (widget.height) style.height = widget.height;
    if (widget.padding) {
        if (typeof widget.padding === 'string') {
            style.padding = widget.padding;
        } else {
            if (widget.padding.top) style.paddingTop = widget.padding.top;
            if (widget.padding.bottom) style.paddingBottom = widget.padding.bottom;
            if (widget.padding.left) style.paddingLeft = widget.padding.left;
            if (widget.padding.right) style.paddingRight = widget.padding.right;
        }
    }
    if (widget.margin) {
        if (typeof widget.margin === 'string') {
            style.margin = widget.margin;
        } else {
            if (widget.margin.top) style.marginTop = widget.margin.top;
            if (widget.margin.bottom) style.marginBottom = widget.margin.bottom;
            if (widget.margin.left) style.marginLeft = widget.margin.left;
            if (widget.margin.right) style.marginRight = widget.margin.right;
        }
    }
    if (widget.zIndex) style.zIndex = widget.zIndex;
    if (widget.flex) style.flex = widget.flex;
    if (widget.overflow) style.overflow = widget.overflow;
    if (widget.display) style.display = widget.display;
    if (widget.flexDirection) style.flexDirection = widget.flexDirection;
    if (widget.gap) style.gap = widget.gap;
    if (widget.transform) style.transform = widget.transform;
    
    return style;
}

export function mergeStyles(...styles) {
    return Object.assign({}, ...styles);
}

export function responsiveValue(breakpoint, values) {
    return values[breakpoint] || values.default || values;
}
