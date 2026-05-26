// =========================================================================
// == NOTICE APP
// =========================================================================
export function useNotice() {
    const notices = [
        {
            id: 1,
            date: '2026-03-14',
            title: '版本 2.0.0',
            content: [
                '全新视觉设计：现代插画极简主义风格',
                'Workshop 对称垂直布局，独立滚动区域',
                'Console 温度控制滑块，优化 AI 交互',
                '主题设置支持 URL 壁纸自定义',
                '修复壁纸存储限制问题，提升稳定性'
            ]
        }
    ];

    const features = [
        {
            id: 1,
            title: 'MATE 应用',
            description: 'MATE 是一个智能助手应用，帮助你管理时间、健康和财务。',
            items: [
                { title: '专注模式', description: '帮助你集中注意力，提高工作效率' },
                { title: '运动模式', description: '记录你的步数和运动数据' },
                { title: '睡眠模式', description: '跟踪你的睡眠质量' },
                { title: '时间轴', description: '查看今日事件和待办事项' },
                { title: '财务状况', description: '管理你的预算和支出' }
            ]
        },
        {
            id: 2,
            title: 'SoulLink',
            description: '与 AI 角色进行自然的对话交流。',
            items: [
                { title: '角色聊天', description: '与创建的角色进行实时对话' },
                { title: '线下模式', description: '进入小说叙事模式' },
                { title: '多媒体支持', description: '发送图片和转账消息' },
                { title: '群组聊天', description: '创建群组，与多个角色互动' },
                { title: '虚拟摄像头', description: '开启虚拟摄像头功能' }
            ]
        },
        {
            id: 3,
            title: 'Workshop',
            description: '创建和管理你的 AI 角色、世界书和预设。',
            items: [
                { title: '角色管理', description: '创建、编辑、导入和导出角色' },
                { title: '世界书', description: '为角色添加详细的世界设定' },
                { title: '预设管理', description: '保存和加载不同的 AI 配置' },
                { title: '批量操作', description: '快速管理多个角色和预设' }
            ]
        },
        {
            id: 4,
            title: 'Console',
            description: '配置 AI 模型和 API 设置，控制对话参数。',
            items: [
                { title: 'API 配置', description: '支持 OpenAI、Claude 等多种 API' },
                { title: '模型选择', description: '选择合适的 AI 模型' },
                { title: '温度控制', description: '调整 AI 回复的创造性和一致性' },
                { title: '系统日志', description: '查看和管理系统运行日志' }
            ]
        },
        {
            id: 5,
            title: 'GAMES',
            description: '丰富的互动游戏，与 AI 一起享受乐趣。',
            items: [
                { title: '石头剪刀布', description: '经典的手势游戏' },
                { title: '真心话大冒险', description: '有趣的社交游戏' },
                { title: 'UNO', description: '流行的纸牌游戏' },
                { title: '飞行棋', description: '经典的棋盘游戏' }
            ]
        },
        {
            id: 6,
            title: 'Theme',
            description: '个性化你的应用外观和主题设置。',
            items: [
                { title: '主题模式', description: '亮色、暗色、跟随系统' },
                { title: '壁纸设置', description: '使用 URL 设置自定义壁纸' },
                { title: '预设壁纸', description: '选择精美的预设壁纸' }
            ]
        }
    ];

    const tips = [
        '在主题设置中，你可以使用 URL 设置自己喜欢的图片作为壁纸',
        '在 SoulLink 中，你可以为角色设置个性化的开场白',
        '在 Workshop 中，你可以创建和管理角色、世界书和预设',
        '在 Console 中，你可以配置 AI 模型和 API 设置，调整温度参数',
        '在 MATE 中，你可以使用专注模式提高工作效率',
        '在 Feed 中，你可以浏览最新的动态和内容',
        '在 Games 中，与 AI 一起玩各种有趣的互动游戏',
        '长按聊天消息可以打开更多操作菜单',
        '支持 PNG 和 JSON 格式的角色卡导入',
        '使用群组功能可以与多个角色同时对话'
    ];

    return {
        notices,
        features,
        tips
    };
}
