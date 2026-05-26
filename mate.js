// =========================================================================
// == MATE APP SCRIPT
// == 智能陪伴助手
// =========================================================================

import { ref, computed, onMounted, onUnmounted, watch } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js';
import { callAI } from './api.js';

export function useMate(soulLinkMessages, characters, activeProfile) {
    // --- 状态管理 ---
    const currentTime = ref(new Date());
    const currentMode = ref(localStorage.getItem('mate_mode') || 'focus'); // focus, exercise, sleep
    // 注意：不能用 `|| null`，否则 id=0 会被当成未选择
    const savedMateCharIdRaw = Number(localStorage.getItem('mate_selected_char'));
    const selectedMateCharacterId = ref(Number.isNaN(savedMateCharIdRaw) ? null : savedMateCharIdRaw);
    const mateAIVoice = ref(null);
    const isGeneratingAIVoice = ref(false);
    
    const focusTime = ref(25 * 60); // 25分钟，单位秒
    const isFocusing = ref(false);
    const isPaused = ref(false);
    const focusStartTime = ref(null);
    const focusHistory = ref(JSON.parse(localStorage.getItem('mate_focus_history') || '[]'));
    const showFocusHistory = ref(false);
    const focusHistoryView = ref('history');
    const focusEncouragement = ref(localStorage.getItem('mate_focus_encouragement') || '');
    const isGeneratingFocusEncouragement = ref(false);
    
    // 财务状态
    const monthlyBudget = ref(Number(localStorage.getItem('mate_budget')) || 3000);
    const monthlyExpenses = ref(0);
    const expenses = ref(JSON.parse(localStorage.getItem('mate_expenses') || '[]').map(e => ({
        ...e,
        date: new Date(e.date)
    })));
    
    // 财务历史和详情
    const currentViewDate = ref(new Date()); // 用于切换查看月份
    const selectedCategoryDetail = ref(null);
    const showCategoryDetailModal = ref(false);

    // 日历和待办
    const events = ref(JSON.parse(localStorage.getItem('mate_events') || '[]').map(e => ({
        ...e,
        startTime: new Date(e.startTime),
        endTime: new Date(e.endTime)
    })));
    
    const todos = ref(JSON.parse(localStorage.getItem('mate_todos') || '[]').map(t => ({
        ...t,
        time: new Date(t.time)
    })));

    // 睡眠日记
    const sleepDiaries = ref(JSON.parse(localStorage.getItem('mate_sleep_diaries') || '[]'));
    const isGeneratingSleepDiary = ref(false);
    const showSleepDiaryModal = ref(false);
    const currentSleepDiary = ref(null);

    // 经期追踪
    const lastPeriodDate = ref(localStorage.getItem('mate_last_period') ? new Date(localStorage.getItem('mate_last_period')) : new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)); // 默认值：14天前
    const cycleLength = ref(Number(localStorage.getItem('mate_cycle_length')) || 28);
    const periodLength = ref(Number(localStorage.getItem('mate_period_days')) || 5);
    const showPeriodSettings = ref(false);
    
    // 经期记录（流量、心情、症状）
    const periodLogs = ref(JSON.parse(localStorage.getItem('mate_period_logs') || '[]'));
    const showPeriodLogModal = ref(false);
    const newPeriodLog = ref({
        date: new Date().toISOString().split('T')[0],
        flow: 'medium',
        mood: 'normal',
        symptoms: []
    });
    
    // 历史预测展开状态
    const showHistoryPrediction = ref(false);
    // 历史记录展开状态
    const showPeriodLogs = ref(false);
    // 经期关心消息
    const periodCareMessage = ref(localStorage.getItem('mate_period_care_message') || '');
    const isGeneratingCare = ref(false);
    // 运动鼓励消息
    const exerciseEncouragement = ref(localStorage.getItem('mate_exercise_encouragement') || '');
    const isGeneratingEncouragement = ref(false);
    // 学习鼓励消息
    const studyEncouragement = ref(localStorage.getItem('mate_study_encouragement') || '');
    const isGeneratingStudyEncouragement = ref(false);
    // 睡眠鼓励消息
    const sleepEncouragement = ref(localStorage.getItem('mate_sleep_encouragement') || '');
    const isGeneratingSleepEncouragement = ref(false);
    // 目标睡眠时长
    const targetSleepDuration = ref(Number(localStorage.getItem('mate_target_sleep_duration')) || 8);

    // 收入记录
    const incomes = ref(JSON.parse(localStorage.getItem('mate_incomes') || '[]'));
    // 存款目标
    const monthlySavingGoal = ref(Number(localStorage.getItem('mate_saving_goal')) || 1000);
    // 初始金额设置
    const initialBalance = ref(Number(localStorage.getItem('mate_initial_balance')) || 0);
    
    // 初始化默认数据（如果为空）
    if (expenses.value.length === 0 && !localStorage.getItem('mate_expenses')) {
        expenses.value = [];
    }
    
    // 初始化收入数据
    if (incomes.value.length === 0 && !localStorage.getItem('mate_incomes')) {
        incomes.value = [];
    }
    
    // 计算已发生的月度支出
    const calculateMonthlyExpenses = () => {
        const viewYear = currentViewDate.value.getFullYear();
        const viewMonth = currentViewDate.value.getMonth();
        monthlyExpenses.value = expenses.value
            .filter(e => {
                const d = new Date(e.date);
                return d.getFullYear() === viewYear && d.getMonth() === viewMonth;
            })
            .reduce((sum, e) => sum + e.amount, 0);
    };
    
    // 计算已发生的月度收入
    const monthlyIncome = computed(() => {
        const viewYear = currentViewDate.value.getFullYear();
        const viewMonth = currentViewDate.value.getMonth();
        return incomes.value
            .filter(i => {
                const d = new Date(i.date);
                return d.getFullYear() === viewYear && d.getMonth() === viewMonth;
            })
            .reduce((sum, i) => sum + i.amount, 0);
    });
    
    // 计算月度余额
    const monthlyBalance = computed(() => {
        return initialBalance.value + monthlyIncome.value - monthlyExpenses.value;
    });
    
    // 计算月度存款进度
    const savingProgress = computed(() => {
        const balance = monthlyBalance.value;
        return Math.min(Math.round((balance / monthlySavingGoal.value) * 100), 100);
    });
    
    // 计算上个月支出
    const lastMonthExpenses = computed(() => {
        const lastMonth = new Date(currentViewDate.value);
        lastMonth.setMonth(lastMonth.getMonth() - 1);
        const lastYear = lastMonth.getFullYear();
        const lastMonthNum = lastMonth.getMonth();
        
        return expenses.value
            .filter(e => {
                const d = new Date(e.date);
                return d.getFullYear() === lastYear && d.getMonth() === lastMonthNum;
            })
            .reduce((sum, e) => sum + e.amount, 0);
    });
    
    // 计算支出变化百分比
    const expenseChangePercent = computed(() => {
        if (lastMonthExpenses.value === 0) return 0;
        const change = ((monthlyExpenses.value - lastMonthExpenses.value) / lastMonthExpenses.value) * 100;
        return Math.round(change);
    });
    calculateMonthlyExpenses();

    // 监听查看日期变化，重新计算
    watch(currentViewDate, () => {
        calculateMonthlyExpenses();
    });

    watch(currentMode, (nextMode, prevMode) => {
        if (prevMode === 'exercise' && motionLineTimer.value) {
            clearInterval(motionLineTimer.value);
            motionLineTimer.value = null;
        }
        if (nextMode === 'exercise') {
            syncMotionLineTimer();
            if (selectedCharacter.value && !currentMotionLine.value) {
                rotateMotionLine();
            }
        }
    });

    watch(selectedMateCharacterId, () => {
        currentMotionLine.value = '';
        currentMotionLineIndex.value = 0;
        motionRecentLines.value = [];
        if (currentMode.value === 'exercise') {
            syncMotionLineTimer();
            if (selectedCharacter.value) {
                refillMotionLines(12).then(() => rotateMotionLine());
            }
        }
        saveToLocal();
    });
    
    // 运动状态（角色语义）
    const exerciseType = ref(localStorage.getItem('mate_exercise_type') || 'walk'); // walk, run, cycling, fitness
    const exercisePaused = ref(localStorage.getItem('mate_exercise_paused') === 'true');
    const exerciseStarted = ref(localStorage.getItem('mate_exercise_started') === 'true');
    const exerciseTypeTransitionAt = ref(0);
    const roleMotionState = ref(JSON.parse(localStorage.getItem('mate_role_motion_state') || 'null') || {
        vitality: 56,
        rhythm: 'calm',
        mood: 'steady',
        warmth: 42,
        progress: 18,
        stage: 'idle'
    });
    const exerciseElapsedSeconds = ref(Number(localStorage.getItem('mate_exercise_elapsed_seconds')) || 0);
    const exerciseSessionStartTime = ref(localStorage.getItem('mate_exercise_session_start_time') ? new Date(localStorage.getItem('mate_exercise_session_start_time')) : null);
    const exerciseRecords = ref(JSON.parse(localStorage.getItem('mate_exercise_records') || '[]').map(r => ({
        ...r,
        startTime: r.startTime ? new Date(r.startTime) : null,
        endTime: r.endTime ? new Date(r.endTime) : null
    })));
    const showExerciseRecords = ref(false);
    const exerciseRecordView = ref('history');
    const exerciseTimer = ref(null);
    const exerciseDiaryGenerating = ref(false);
    const exerciseDiaries = ref(JSON.parse(localStorage.getItem('mate_exercise_diaries') || '[]').map(d => ({
        ...d,
        createdAt: d.createdAt ? new Date(d.createdAt) : null
    })));
    const motionLinePool = ref(JSON.parse(localStorage.getItem('mate_motion_line_pool') || '{}'));
    const currentMotionLine = ref(localStorage.getItem('mate_current_motion_line') || '');
    const currentMotionLineIndex = ref(Number(localStorage.getItem('mate_motion_line_index')) || 0);
    const motionLineTimer = ref(null);
    const motionLastRenderedAt = ref(Number(localStorage.getItem('mate_motion_last_rendered_at')) || 0);
    const motionLastRefillAt = ref(Number(localStorage.getItem('mate_motion_last_refill_at')) || 0);
    const motionRecentLines = ref(JSON.parse(localStorage.getItem('mate_motion_recent_lines') || '[]'));
    const isMotionLineTransitioning = ref(false);
    let motionLineTransitionTimeout = null;
    const motionPoolUpdatedAt = ref(Number(localStorage.getItem('mate_motion_pool_updated_at')) || 0);
    const motionLineDisplayMs = 3 * 60 * 1000;
    const motionLineMinPool = 5;
    const motionLineRefillThreshold = 4;
    const motionLineMaxPool = 20;
    const steps = computed(() => Math.round(roleMotionState.value.progress * 120));
    const targetSteps = computed(() => 12000);
    const heartRate = computed(() => {
        if (currentMode.value === 'exercise') return 90 + Math.round(roleMotionState.value.vitality * 0.4);
        if (currentMode.value === 'sleep') return 58 + Math.round((100 - roleMotionState.value.vitality) * 0.08);
        return 72 + Math.round(roleMotionState.value.warmth * 0.05);
    });
    
    // 运动类型定义
    const exerciseTypes = [
        { id: 'walk', label: '散步', icon: 'fa-walking' },
        { id: 'run', label: '跑步', icon: 'fa-running' },
        { id: 'cycling', label: '骑行', icon: 'fa-biking' },
        { id: 'fitness', label: '健身', icon: 'fa-dumbbell' }
    ];

    // 睡眠状态
    const sleepDuration = ref(Number(localStorage.getItem('mate_sleep_duration')) || 0); // 分钟
    const sleepQuality = ref('good');
    const sleepStartTime = ref(localStorage.getItem('mate_sleep_start_time') ? new Date(localStorage.getItem('mate_sleep_start_time')) : null);
    const isSleeping = ref(localStorage.getItem('mate_is_sleeping') === 'true');
    
    // UI 状态
    const showAddExpenseModal = ref(false);
    const showAddIncomeModal = ref(false);
    const showIncomeCategoryDetailModal = ref(false);
    const showAddTodoModal = ref(false);
    const showAddEventModal = ref(false);
    const showQuickSceneMenu = ref(false);
    const showMateChatPanel = ref(false);
    const showTodayPanel = ref(false);
    const showCharacterPicker = ref(false);
    const newExpense = ref({ 
        amount: '', 
        category: '餐饮', 
        description: '', 
        selectedCharacterId: null,
        date: new Date().toISOString().split('T')[0] 
    });
    const isGeneratingComment = ref(false);
    const newTodo = ref({ text: '', time: '' });
    const newEvent = ref({ title: '', startTime: '', endTime: '', category: 'class' });

    // 持久化方法
    const saveToLocal = () => {
        localStorage.setItem('mate_mode', currentMode.value);
        localStorage.setItem('mate_selected_char', selectedMateCharacterId.value);
        localStorage.setItem('mate_exercise_type', exerciseType.value);
        localStorage.setItem('mate_exercise_paused', exercisePaused.value.toString());
        localStorage.setItem('mate_exercise_started', exerciseStarted.value.toString());
        localStorage.setItem('mate_exercise_record_view', exerciseRecordView.value);
        localStorage.setItem('mate_focus_encouragement', focusEncouragement.value);
        localStorage.setItem('mate_role_motion_state', JSON.stringify(roleMotionState.value));
        localStorage.setItem('mate_motion_line_pool', JSON.stringify(motionLinePool.value));
        localStorage.setItem('mate_current_motion_line', currentMotionLine.value);
        localStorage.setItem('mate_motion_line_index', String(currentMotionLineIndex.value));
        localStorage.setItem('mate_motion_last_rendered_at', String(motionLastRenderedAt.value));
        localStorage.setItem('mate_motion_last_refill_at', String(motionLastRefillAt.value));
        localStorage.setItem('mate_motion_recent_lines', JSON.stringify(motionRecentLines.value));
        localStorage.setItem('mate_motion_pool_updated_at', String(motionPoolUpdatedAt.value));
        localStorage.setItem('mate_motion_transitioning', String(isMotionLineTransitioning.value));
        localStorage.setItem('mate_exercise_elapsed_seconds', String(exerciseElapsedSeconds.value));
        localStorage.setItem('mate_exercise_session_start_time', exerciseSessionStartTime.value ? exerciseSessionStartTime.value.toISOString() : '');
        localStorage.setItem('mate_exercise_records', JSON.stringify(exerciseRecords.value));
        localStorage.setItem('mate_exercise_diaries', JSON.stringify(exerciseDiaries.value));
        localStorage.setItem('mate_focus_history', JSON.stringify(focusHistory.value));
        localStorage.setItem('mate_focus_history_view', focusHistoryView.value);
        localStorage.setItem('mate_budget', monthlyBudget.value.toString());
        localStorage.setItem('mate_expenses', JSON.stringify(expenses.value));
        localStorage.setItem('mate_incomes', JSON.stringify(incomes.value));
        localStorage.setItem('mate_saving_goal', monthlySavingGoal.value.toString());
        localStorage.setItem('mate_initial_balance', initialBalance.value.toString());
        localStorage.setItem('mate_events', JSON.stringify(events.value));
        localStorage.setItem('mate_todos', JSON.stringify(todos.value));
        localStorage.setItem('mate_sleep_duration', sleepDuration.value.toString());
        localStorage.setItem('mate_sleep_diaries', JSON.stringify(sleepDiaries.value));
        localStorage.setItem('mate_is_sleeping', isSleeping.value.toString());
        if (sleepStartTime.value) localStorage.setItem('mate_sleep_start_time', sleepStartTime.value.toISOString());
        else localStorage.removeItem('mate_sleep_start_time');
        if (lastPeriodDate.value) localStorage.setItem('mate_last_period', lastPeriodDate.value.toISOString());
        localStorage.setItem('mate_cycle_length', cycleLength.value.toString());
        localStorage.setItem('mate_period_days', periodLength.value.toString());
        localStorage.setItem('mate_period_logs', JSON.stringify(periodLogs.value));
        localStorage.setItem('mate_period_care_message', periodCareMessage.value);
        localStorage.setItem('mate_exercise_encouragement', exerciseEncouragement.value);
        localStorage.setItem('mate_study_encouragement', studyEncouragement.value);
        localStorage.setItem('mate_sleep_encouragement', sleepEncouragement.value);
        localStorage.setItem('mate_target_sleep_duration', targetSleepDuration.value);
        localStorage.setItem('mate_scroll_mode', sceneScrollMode.value);
    };

    // --- 计算属性 ---
    const clockHands = computed(() => {
        const now = currentTime.value;
        const seconds = now.getSeconds();
        const minutes = now.getMinutes();
        const hours = now.getHours() % 12;

        return {
            second: seconds * 6, // 360 / 60
            minute: minutes * 6 + seconds * 0.1, // 360 / 60 + 6 / 60
            hour: hours * 30 + minutes * 0.5 // 360 / 12 + 30 / 60
        };
    });

    const currentExerciseIcon = computed(() => {
        const type = exerciseTypes.find(t => t.id === exerciseType.value);
        return type ? type.icon : 'fa-running';
    });

    const isPeriodToday = computed(() => {
        if (!lastPeriodDate.value) return false;
        const now = new Date();
        const diff = Math.floor((now - lastPeriodDate.value) / (1000 * 60 * 60 * 24));
        const daysSinceCycleStart = diff % cycleLength.value;
        return daysSinceCycleStart >= 0 && daysSinceCycleStart < periodLength.value;
    });

    const predictedNextPeriod = computed(() => {
        if (!lastPeriodDate.value) return null;
        const next = new Date(lastPeriodDate.value);
        next.setDate(next.getDate() + cycleLength.value);
        return next;
    });

    const daysUntilNextPeriod = computed(() => {
        if (!predictedNextPeriod.value) return null;
        const now = new Date();
        return Math.ceil((predictedNextPeriod.value - now) / (1000 * 60 * 60 * 24));
    });

    const periodStatusText = computed(() => {
        if (isPeriodToday.value) return '当前处于经期';
        if (daysUntilNextPeriod.value !== null) {
            if (daysUntilNextPeriod.value <= 3) return `经期即将在 ${daysUntilNextPeriod.value} 天后到来`;
            return `距离下次经期还有 ${daysUntilNextPeriod.value} 天`;
        }
        return '暂无经期记录';
    });

    // 计算当前周期天数
    const currentCycleDay = computed(() => {
        if (!lastPeriodDate.value) return 0;
        const now = new Date();
        const diff = Math.floor((now - lastPeriodDate.value) / (1000 * 60 * 60 * 24));
        return diff % cycleLength.value + 1;
    });

    // 计算周期阶段
    const periodPhase = computed(() => {
        if (!lastPeriodDate.value) return 'unknown';
        const day = currentCycleDay.value;
        const cycle = cycleLength.value;
        
        if (day >= 1 && day <= periodLength.value) {
            return 'menstrual';
        } else if (day > periodLength.value && day <= Math.floor(cycle * 0.5)) {
            return 'follicular';
        } else if (day > Math.floor(cycle * 0.5) && day <= Math.floor(cycle * 0.6)) {
            return 'ovulation';
        } else {
            return 'luteal';
        }
    });

    // 计算月相环位置（角度）
    const moonRingAngle = computed(() => {
        if (!lastPeriodDate.value) return 0;
        const day = currentCycleDay.value;
        const cycle = cycleLength.value;
        return (day / cycle) * 360;
    });

    // 计算排卵日
    const ovulationDay = computed(() => {
        if (!lastPeriodDate.value) return null;
        return Math.floor(cycleLength.value * 0.5);
    });

    // 历史预测数据
    const historyPrediction = computed(() => {
        if (!lastPeriodDate.value) return [];
        const predictions = [];
        const baseDate = new Date(lastPeriodDate.value);
        
        for (let i = 0; i < 3; i++) {
            const monthDate = new Date(baseDate);
            monthDate.setMonth(monthDate.getMonth() + i);
            
            const startDate = new Date(monthDate);
            const endDate = new Date(startDate);
            endDate.setDate(startDate.getDate() + periodLength.value);
            
            predictions.push({
                month: startDate.getMonth() + 1,
                startDate: startDate,
                endDate: endDate,
                ovulationDate: new Date(startDate)
            });
            
            predictions[predictions.length - 1].ovulationDate.setDate(
                startDate.getDate() + Math.floor(cycleLength.value * 0.5)
            );
        }
        
        return predictions;
    });

    const periodDialogMessage = computed(() => {
        if (!selectedCharacter.value) return null;
        if (isPeriodToday.value) {
            return `记得喝热水，不要贪凉哦。需要我为你做点什么吗？`;
        }
        if (daysUntilNextPeriod.value !== null && daysUntilNextPeriod.value <= 3) {
            return `最近是不是感觉有点累？过几天就是那个日子了，多休息下。`;
        }
        return null;
    });

    const currentHour = computed(() => currentTime.value.getHours());
    const currentMinute = computed(() => currentTime.value.getMinutes());
    const currentSecond = computed(() => currentTime.value.getSeconds());
    
    const focusTimeFormatted = computed(() => {
        const minutes = Math.floor(focusTime.value / 60);
        const seconds = focusTime.value % 60;
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    });
    
    const groupedExpenses = computed(() => {
        const viewYear = currentViewDate.value.getFullYear();
        const viewMonth = currentViewDate.value.getMonth();
        
        const filteredExpenses = expenses.value.filter(e => {
            const d = new Date(e.date);
            return d.getFullYear() === viewYear && d.getMonth() === viewMonth;
        });
        
        const groups = {};
        filteredExpenses.forEach(e => {
            if (!groups[e.category]) {
                groups[e.category] = {
                    category: e.category,
                    amount: 0,
                    count: 0
                };
            }
            groups[e.category].amount += e.amount;
            groups[e.category].count += 1;
        });
        
        return Object.values(groups).sort((a, b) => b.amount - a.amount);
    });

    // 收入分类统计
    const groupedIncomes = computed(() => {
        const viewYear = currentViewDate.value.getFullYear();
        const viewMonth = currentViewDate.value.getMonth();
        
        const filteredIncomes = incomes.value.filter(i => {
            const d = new Date(i.date);
            return d.getFullYear() === viewYear && d.getMonth() === viewMonth;
        });
        
        const groups = {};
        filteredIncomes.forEach(i => {
            if (!groups[i.category]) {
                groups[i.category] = {
                    category: i.category,
                    amount: 0,
                    count: 0
                };
            }
            groups[i.category].amount += i.amount;
            groups[i.category].count += 1;
        });
        
        return Object.values(groups).sort((a, b) => b.amount - a.amount);
    });

    const categoryDetails = computed(() => {
        if (!selectedCategoryDetail.value) return [];
        const viewYear = currentViewDate.value.getFullYear();
        const viewMonth = currentViewDate.value.getMonth();
        
        return expenses.value
            .filter(e => {
                const d = new Date(e.date);
                return d.getFullYear() === viewYear && 
                       d.getMonth() === viewMonth && 
                       e.category === selectedCategoryDetail.value;
            })
            .sort((a, b) => b.date - a.date);
    });

    const incomeCategoryDetails = computed(() => {
        if (!selectedCategoryDetail.value) return [];
        const viewYear = currentViewDate.value.getFullYear();
        const viewMonth = currentViewDate.value.getMonth();
        
        return incomes.value
            .filter(i => {
                const d = new Date(i.date);
                return d.getFullYear() === viewYear && 
                       d.getMonth() === viewMonth && 
                       i.category === selectedCategoryDetail.value;
            })
            .sort((a, b) => b.date - a.date);
    });

    const comparisonChartData = computed(() => {
        const viewYear = currentViewDate.value.getFullYear();
        const viewMonth = currentViewDate.value.getMonth();
        
        // 准备上个月的日期
        const prevMonthDate = new Date(viewYear, viewMonth - 1, 1);
        const prevYear = prevMonthDate.getFullYear();
        const prevMonth = prevMonthDate.getMonth();

        // 获取当月和上个月的支出
        const currentExpenses = expenses.value.filter(e => {
            const d = new Date(e.date);
            return d.getFullYear() === viewYear && d.getMonth() === viewMonth;
        });
        const prevExpenses = expenses.value.filter(e => {
            const d = new Date(e.date);
            return d.getFullYear() === prevYear && d.getMonth() === prevMonth;
        });

        // 计算每日累计支出 (1-31日)
        const getDailyCumulative = (monthExpenses, year, month) => {
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const dailyData = new Array(daysInMonth).fill(0);
            
            monthExpenses.forEach(e => {
                // 确保 e.date 是有效的 Date 对象
                const d = e.date instanceof Date ? e.date : new Date(e.date);
                if (d.getFullYear() === year && d.getMonth() === month) {
                    const day = d.getDate();
                    if (day <= daysInMonth) {
                        dailyData[day - 1] += e.amount;
                    }
                }
            });

            let cumulative = 0;
            return dailyData.map(amount => {
                cumulative += amount;
                return cumulative;
            });
        };

        const currentLine = getDailyCumulative(currentExpenses, viewYear, viewMonth);
        const prevLine = getDailyCumulative(prevExpenses, prevYear, prevMonth);

        // 归一化用于 SVG 绘图 (0-100)
        const maxVal = Math.max(...currentLine, ...prevLine, 100);
        const scale = (val) => 100 - (val / maxVal * 100);

        const buildPath = (lineData) => {
            if (lineData.length === 0) return '';
            const stepX = 100 / (lineData.length - 1 || 1);
            return lineData.map((val, i) => `${i * stepX},${scale(val)}`).join(' L ');
        };

        const currentPath = buildPath(currentLine);
        const prevPath = buildPath(prevLine);

        return {
            currentPath: currentPath ? 'M ' + currentPath : '',
            prevPath: prevPath ? 'M ' + prevPath : '',
            maxAmount: Math.round(maxVal),
            currentTotal: currentLine[currentLine.length - 1] || 0,
            prevTotal: prevLine[prevLine.length - 1] || 0
        };
    });

    const containerClass = computed(() => {
        const hour = currentHour.value;
        if (hour >= 6 && hour < 12) return 'morning';
        if (hour >= 18 && hour < 22) return 'evening';
        if (hour >= 22 || hour < 6) return 'night';
        return '';
    });
    
    const currentEvent = computed(() => {
        const now = new Date();
        return events.value.find(event => {
            return new Date(event.startTime) <= now && new Date(event.endTime) >= now;
        });
    });
    const sceneModes = ['focus', 'exercise', 'sleep', 'life'];
    const sceneScrollMode = ref(localStorage.getItem('mate_scroll_mode') || 'auto');
    const currentSceneIndex = computed(() => {
        const idx = sceneModes.indexOf(currentMode.value);
        return idx >= 0 ? idx : 0;
    });
    const pendingTodos = computed(() => todos.value.filter(t => !t.completed));
    const sceneMetaMap = {
        focus: { badge: '专注 · 时光', watermark: 'FOCUS', editor: 'Monochrome Companion', title: '专注学习' },
        exercise: { badge: '跃动 · 身体', watermark: 'MOVE', editor: 'Body Motion', title: '运动陪伴' },
        sleep: { badge: '安眠 · 梦境', watermark: 'NIGHT', editor: 'Dream Archive', title: '睡眠守护' },
        life: { badge: '生活 · 拾光', watermark: 'LIFE', editor: 'Ledger Notes', title: '生活管理' }
    };
    const currentModeLabel = computed(() => sceneMetaMap[currentMode.value]?.title || '生活陪伴');
    const currentSceneMeta = computed(() => sceneMetaMap[currentMode.value] || sceneMetaMap.focus);
    const todayPanel = computed(() => {
        const now = new Date();
        const todaysFocusSessions = focusHistory.value.filter(h => {
            const raw = h.startTime || h.date || h.endTime;
            return raw ? new Date(raw).toDateString() === now.toDateString() : false;
        }).length;
        const todoCount = pendingTodos.value.length;
        const nextEvent = recentEvents.value[0];
        const balance = monthlyBalance.value;
        return {
            title: currentModeLabel.value,
            subtitle: selectedCharacter.value ? `正在陪伴 ${selectedCharacter.value.nickname || selectedCharacter.value.name}` : '先选一个长期陪伴角色',
            summary: currentMode.value === 'focus'
                ? `今天已专注 ${todaysFocusSessions} 次`
                : currentMode.value === 'exercise'
                    ? `运动进度 ${exerciseProgress.value}%`
                    : currentMode.value === 'sleep'
                        ? (isSleeping.value ? '我在陪你睡觉' : '准备进入睡眠模式')
                        : periodStatusText.value,
            balanceText: balance >= 0 ? `余额 ¥${balance}` : `透支 ¥${Math.abs(balance)}`,
            todoText: todoCount > 0 ? `${todoCount} 个待办` : '今天很轻松',
            nextEventText: nextEvent
                ? `${nextEvent.title} · ${new Date(nextEvent.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                : '今天暂无安排'
        };
    });
    const currentAvatarUrl = computed(() => selectedCharacter.value?.avatarUrl || '');
    const motionLinePoolKey = computed(() => selectedCharacter.value ? String(selectedCharacter.value.id) : 'default');
    const motionLinesForCurrentCharacter = computed(() => motionLinePool.value[motionLinePoolKey.value]?.lines || []);
    const motionStageLabelMap = {
        idle: '待机',
        warmup: '热身',
        active: '进行中',
        cooldown: '放松中',
        rest: '休息中'
    };
    const motionRhythmLabelMap = {
        calm: '平稳',
        light: '轻快',
        active: '活跃',
        intense: '强烈'
    };
    const motionMoodLabelMap = {
        steady: '平稳',
        bright: '明快',
        tired: '疲惫',
        focused: '专注',
        relaxed: '放松'
    };
    const motionStateSummary = computed(() => {
        const state = roleMotionState.value;
        return `活力 ${state.vitality} · 节律 ${motionRhythmLabelMap[state.rhythm] || state.rhythm} · 心绪 ${motionMoodLabelMap[state.mood] || state.mood}`;
    });
    const motionStateStageText = computed(() => motionStageLabelMap[roleMotionState.value.stage] || roleMotionState.value.stage);
    const sceneUnifiedData = computed(() => ({
        title: currentSceneMeta.value.title,
        badge: currentSceneMeta.value.badge,
        watermark: currentSceneMeta.value.watermark,
        editor: currentSceneMeta.value.editor,
        primaryStat: currentMode.value === 'focus'
            ? focusTimeFormatted.value
            : currentMode.value === 'exercise'
                ? `活力 ${roleMotionState.value.vitality}`
                : currentMode.value === 'sleep'
                    ? `${targetSleepDuration.value}h`
                    : `¥${Math.max(0, monthlyBudget.value - monthlyExpenses.value)}`,
        secondaryStat: currentMode.value === 'focus'
            ? `${focusHistory.value.length} 次`
            : currentMode.value === 'exercise'
                ? `${roleMotionState.value.progress}%`
                : currentMode.value === 'sleep'
                    ? `${sleepDiaries.value.length} 条日记`
                    : `${pendingTodos.value.length} 个待办`,
        actionPrimary: currentMode.value === 'sleep' ? (isSleeping.value ? '醒来' : '开始入睡') : '开始',
        actionSecondary: currentMode.value === 'life' ? '记账' : '切换'
    }));
    const recentEvents = computed(() => {
        const now = Date.now();
        return [...events.value]
            .filter(e => new Date(e.endTime).getTime() >= now - 24 * 60 * 60 * 1000)
            .sort((a, b) => new Date(a.startTime) - new Date(b.startTime))
            .slice(0, 3);
    });
    const exerciseProgress = computed(() => roleMotionState.value.progress);
    const exerciseElapsedText = computed(() => formatExerciseDuration(exerciseElapsedSeconds.value));

    const selectedCharacter = computed(() => {
        if ((selectedMateCharacterId.value === null || selectedMateCharacterId.value === undefined) || !characters.value) return null;
        return characters.value.find(c => Number(c.id) === Number(selectedMateCharacterId.value));
    });
    
    // --- 方法 ---
    const motionTypeConfig = {
        walk: { stage: 'warmup', rhythm: 'calm', mood: 'steady', vitalityGain: 0.22, progressGain: 0.18, warmthGain: 0.14 },
        run: { stage: 'active', rhythm: 'active', mood: 'bright', vitalityGain: 0.4, progressGain: 0.35, warmthGain: 0.12 },
        cycling: { stage: 'active', rhythm: 'light', mood: 'focused', vitalityGain: 0.3, progressGain: 0.22, warmthGain: 0.1 },
        fitness: { stage: 'cooldown', rhythm: 'intense', mood: 'focused', vitalityGain: 0.28, progressGain: 0.3, warmthGain: 0.18 }
    };

    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
    const formatExerciseDuration = (seconds) => {
        const total = Math.max(0, Math.floor(seconds));
        const mins = Math.floor(total / 60).toString().padStart(2, '0');
        const secs = (total % 60).toString().padStart(2, '0');
        return `${mins}:${secs}`;
    };

    const setMotionStage = (stage) => {
        roleMotionState.value.stage = stage;
        if (stage === 'warmup') {
            roleMotionState.value.rhythm = 'light';
            roleMotionState.value.mood = 'steady';
        } else if (stage === 'active') {
            roleMotionState.value.rhythm = motionTypeConfig[exerciseType.value]?.rhythm || 'active';
            roleMotionState.value.mood = motionTypeConfig[exerciseType.value]?.mood || 'bright';
        } else if (stage === 'cooldown') {
            roleMotionState.value.rhythm = 'calm';
            roleMotionState.value.mood = 'relaxed';
        } else if (stage === 'rest') {
            roleMotionState.value.rhythm = 'calm';
            roleMotionState.value.mood = 'tired';
        }
    };

    const getMotionTarget = () => {
        const cfg = motionTypeConfig[exerciseType.value] || motionTypeConfig.walk;
        const state = roleMotionState.value;
        const exercising = currentMode.value === 'exercise' && !exercisePaused.value;
        const paused = currentMode.value === 'exercise' && exercisePaused.value;
        const vitalityBase = exerciseType.value === 'run' ? 82 : exerciseType.value === 'cycling' ? 74 : exerciseType.value === 'fitness' ? 78 : 68;
        const vitalityTarget = exercising
            ? vitalityBase + Math.min(18, state.progress * 0.12)
            : paused
                ? 64
                : 58;
        const progressTarget = exercising
            ? clamp(state.progress + cfg.progressGain * 2.2, 0, 100)
            : paused
                ? clamp(state.progress + 0.02, 0, 100)
                : clamp(state.progress - 0.06, 0, 100);
        const warmthTarget = exercising
            ? clamp(44 + state.progress * 0.18, 0, 100)
            : paused
                ? 38
                : 32;
        return {
            vitality: clamp(vitalityTarget, 0, 100),
            progress: progressTarget,
            warmth: warmthTarget,
            rhythm: exercising ? cfg.rhythm : paused ? 'calm' : state.rhythm,
            mood: exercising ? cfg.mood : paused ? 'steady' : state.mood,
            stage: exercising ? cfg.stage : paused ? 'cooldown' : 'idle'
        };
    };

    const smoothMotionState = () => {
        const state = roleMotionState.value;
        const target = getMotionTarget();
        state.vitality += (target.vitality - state.vitality) * 0.018;
        state.progress += (target.progress - state.progress) * 0.03;
        state.warmth += (target.warmth - state.warmth) * 0.02;
        state.vitality = Math.round(clamp(state.vitality, 0, 100));
        state.progress = Math.round(clamp(state.progress, 0, 100));
        state.warmth = Math.round(clamp(state.warmth, 0, 100));
        state.rhythm = target.rhythm;
        state.mood = target.mood;
        state.stage = target.stage;
    };

    const getMotionPool = (characterId) => motionLinePool.value[String(characterId)] || { updatedAt: 0, lines: [] };

    const setMotionPool = (characterId, pool) => {
        motionLinePool.value[String(characterId)] = pool;
        motionPoolUpdatedAt.value = Date.now();
    };

    const beginMotionTransition = () => {
        isMotionLineTransitioning.value = true;
        if (motionLineTransitionTimeout) clearTimeout(motionLineTransitionTimeout);
        motionLineTransitionTimeout = setTimeout(() => {
            isMotionLineTransitioning.value = false;
        }, 900);
    };

    const refillMotionLines = async (count = 12) => {
        if (!selectedCharacter.value || !activeProfile.value) return;
        const characterId = String(selectedCharacter.value.id);
        const prompt = `角色信息：\n姓名：${selectedCharacter.value.name}\n人设：${selectedCharacter.value.persona || selectedCharacter.value.summary}\n语气特点：${selectedCharacter.value.styleTags || '温柔,陪伴'}\n当前场景：运动陪伴\n当前状态：${roleMotionState.value.stage}\n当前情绪：${roleMotionState.value.mood}\n当前节律：${roleMotionState.value.rhythm}\n当前互动温度：${roleMotionState.value.warmth}\n请生成 ${count} 句适合轮播展示的角色台词。\n要求：每句 10-25 字，不要提真实健康设备术语，只输出 JSON 数组。`;
        try {
            const raw = await callAI(activeProfile.value, [
                { role: 'system', content: '你正在生成运动场景台词池，只输出 JSON 数组。' },
                { role: 'user', content: prompt }
            ], { temperature: 0.9 });
            const content = String(raw || '').trim();
            const match = content.match(/\[[\s\S]*\]/);
            if (!match) return;
            const lines = JSON.parse(match[0]).map(text => ({
                text: String(text).trim(),
                mood: roleMotionState.value.mood,
                stage: roleMotionState.value.stage,
                weight: 1
            })).filter(item => item.text);
            const existing = getMotionPool(characterId);
            const usedTexts = new Set(motionRecentLines.value);
            const existingUnused = (existing.lines || []).filter(line => line?.text && !usedTexts.has(line.text));
            const merged = [...existingUnused, ...lines].slice(0, motionLineMaxPool);
            setMotionPool(characterId, { updatedAt: Date.now(), lines: merged });
            if (currentMode.value === 'exercise' && currentMotionLine.value && merged.length < motionLineRefillThreshold) {
                await rotateMotionLine();
            }
            saveToLocal();
        } catch (error) {
            console.error('补货运动台词失败:', error);
        }
    };

    const getMotionLineScore = (line, poolCount) => {
        const stage = roleMotionState.value.stage;
        const mood = roleMotionState.value.mood;
        const recent = motionRecentLines.value.slice(-3);
        let score = (line.weight || 1) * 10;
        if (line.stage === stage) score += 40;
        else if (line.stage === 'active' && stage === 'warmup') score += 12;
        else if (line.stage === 'cooldown' && stage === 'rest') score += 12;
        if (line.mood === mood) score += 22;
        else if (line.mood === 'steady' && mood === 'tired') score += 8;
        if (recent.includes(line.text)) score -= 100;
        if (poolCount <= 3) score += 6;
        if (line.text.length <= 12) score += 3;
        return score;
    };

    const pickMotionLine = () => {
        if (!selectedCharacter.value) return '';
        const pool = getMotionPool(String(selectedCharacter.value.id));
        const lines = pool.lines || [];
        if (!lines.length) return '';
        const scored = lines
            .map(line => ({ line, score: getMotionLineScore(line, lines.length) }))
            .sort((a, b) => b.score - a.score || Math.random() - 0.5);
        return scored[0]?.line?.text || '';
    };

    const rotateMotionLine = async () => {
        if (currentMode.value !== 'exercise') return;
        if (!selectedCharacter.value || !activeProfile.value) return;
        const pool = getMotionPool(String(selectedCharacter.value.id));
        if (!pool.lines || pool.lines.length < motionLineMinPool) {
            await refillMotionLines(12);
        }
        const nextLine = pickMotionLine();
        if (nextLine) {
            beginMotionTransition();
            currentMotionLine.value = '';
            currentMotionLineIndex.value = (currentMotionLineIndex.value + 1) % Math.max(1, (getMotionPool(String(selectedCharacter.value.id)).lines || []).length);
            motionRecentLines.value = [...motionRecentLines.value, nextLine].slice(-10);
            const poolAfterUse = getMotionPool(String(selectedCharacter.value.id));
            const remaining = (poolAfterUse.lines || []).filter(line => line.text !== nextLine);
            setMotionPool(String(selectedCharacter.value.id), { updatedAt: Date.now(), lines: remaining });
            setTimeout(() => {
                currentMotionLine.value = nextLine;
                motionLastRenderedAt.value = Date.now();
                saveToLocal();
            }, 260);
        }
    };

    const syncMotionLineTimer = () => {
        if (motionLineTimer.value) clearInterval(motionLineTimer.value);
        motionLineTimer.value = setInterval(async () => {
            if (currentMode.value !== 'exercise') return;
            const now = Date.now();
            const elapsed = now - motionLastRenderedAt.value;
            if (currentMotionLine.value && elapsed < motionLineDisplayMs) return;

            if (elapsed >= motionLineDisplayMs || !currentMotionLine.value) {
                await rotateMotionLine();
            }

            const pool = selectedCharacter.value ? getMotionPool(String(selectedCharacter.value.id)) : { lines: [] };
            if ((pool.lines || []).length < motionLineRefillThreshold || now - motionLastRefillAt.value > 30 * 60 * 1000) {
                motionLastRefillAt.value = now;
                await refillMotionLines(8);
            }
        }, 10 * 1000);
    };

    const updateTime = () => {
        currentTime.value = new Date();
        smoothMotionState();
        if (currentMode.value === 'exercise' && !currentMotionLine.value) {
            rotateMotionLine();
        }
        if ((currentMode.value === 'focus' || currentMode.value === 'exercise') && selectedMateCharacterId.value !== null && selectedMateCharacterId.value !== undefined && activeProfile.value) {
            if (Math.random() > 0.998) {
                generatePeriodicAIComment();
            }
        }
        if (Math.random() > 0.9975 && selectedMateCharacterId.value !== null && selectedMateCharacterId.value !== undefined && activeProfile.value) {
            generateCompanionNudge();
        }
    };

    const generatePeriodicAIComment = async () => {
        if (!selectedCharacter.value || !activeProfile.value || isGeneratingAIVoice.value) return;
        
        isGeneratingAIVoice.value = true;
        try {
            const modeName = currentMode.value === 'focus' ? '专注学习/工作' : '运动锻炼';
            let periodContext = "";
            if (isPeriodToday.value) {
                periodContext = "。注意：你的朋友现在正处于生理期（经期），身体可能比较虚弱或情绪波动。";
            } else if (daysUntilNextPeriod.value !== null && daysUntilNextPeriod.value <= 3) {
                periodContext = `。注意：你的朋友的生理期即将在 ${daysUntilNextPeriod.value} 天后到来，可能处于经前综合征（PMS）期间。`;
            }

            const prompt = `你现在要扮演角色：${selectedCharacter.value.name}。
角色人设：${selectedCharacter.value.persona || selectedCharacter.value.summary}
你的朋友正在进行：${modeName}${periodContext}。
请根据你的性格，给ta说一句鼓励、吐槽、关心或者陪伴的话（不超过25字）。
直接返回话语内容。`;

            const text = await callAI(
                activeProfile.value,
                [
                    { role: 'system', content: `你正在扮演角色：${selectedCharacter.value.name}。` },
                    { role: 'user', content: prompt }
                ],
                { temperature: 0.9 }
            );
            if (text) {
                mateAIVoice.value = String(text).trim();
                setTimeout(() => {
                    mateAIVoice.value = null;
                }, 8000);
            }
        } catch (error) {
            console.error('周期性 AI 留言失败:', error);
        } finally {
            isGeneratingAIVoice.value = false;
        }
    };
    
    let focusInterval;
    const startFocus = () => {
        isFocusing.value = true;
        isPaused.value = false;
        focusStartTime.value = new Date();
        
        focusInterval = setInterval(() => {
            if (!isPaused.value && isFocusing.value) {
                if (focusTime.value > 0) {
                    focusTime.value--;
                } else {
                    clearInterval(focusInterval);
                    completeFocus();
                }
            }
        }, 1000);
    };
    
    const pauseFocus = () => {
        isPaused.value = !isPaused.value;
    };

    const openFocusHistory = (view = 'history') => {
        focusHistoryView.value = view;
        showFocusHistory.value = true;
    };
    const generateFocusEncouragement = async () => {
        if (!selectedCharacter.value || !activeProfile.value || isGeneratingFocusEncouragement.value) return;
        isGeneratingFocusEncouragement.value = true;
        try {
            const prompt = `你正在扮演角色：${selectedCharacter.value.name}。
角色人设：${selectedCharacter.value.persona || selectedCharacter.value.summary}
当前场景：工作/学习专注
当前状态：${isFocusing.value ? (isPaused.value ? '已暂停' : '专注中') : '准备开始'}

请生成一句适合学习/工作专注时的陪伴台词。
要求：
1. 10-25字
2. 语气自然、轻松、像角色在陪伴用户专注
3. 可以鼓励、提醒、关心、轻吐槽，但不要说教
4. 不要提运动，不要提睡眠
5. 只输出一句话`;

            const text = await callAI(
                activeProfile.value,
                [
                    { role: 'system', content: `你正在扮演角色：${selectedCharacter.value.name}。只输出一句专注陪伴台词。` },
                    { role: 'user', content: prompt }
                ],
                { temperature: 0.85 }
            );
            focusEncouragement.value = String(text || '').trim();
            saveToLocal();
        } finally {
            isGeneratingFocusEncouragement.value = false;
        }
    };
    
    const cancelFocus = () => {
        if (focusInterval) clearInterval(focusInterval);
        isFocusing.value = false;
        isPaused.value = false;
        focusTime.value = 25 * 60;
        focusStartTime.value = null;
    };
    
    const completeFocus = () => {
        isFocusing.value = false;
        focusHistory.value.push({
            startTime: focusStartTime.value,
            endTime: new Date(),
            duration: 25 // 分钟
        });
        focusTime.value = 25 * 60;
        focusStartTime.value = null;
        saveToLocal();
    };
    
    const setPeriodStartDate = (dateStr) => {
        if (!dateStr) return;
        lastPeriodDate.value = new Date(dateStr);
        saveToLocal();
    };

    const submitPeriodLog = () => {
        const log = {
            id: Date.now(),
            date: new Date(newPeriodLog.value.date),
            flow: newPeriodLog.value.flow,
            mood: newPeriodLog.value.mood,
            symptoms: newPeriodLog.value.symptoms
        };
        periodLogs.value.push(log);
        saveToLocal();
        showPeriodLogModal.value = false;
        newPeriodLog.value = {
            date: new Date().toISOString().split('T')[0],
            flow: 'medium',
            mood: 'normal',
            symptoms: []
        };
    };

    const deletePeriodLog = (id) => {
        periodLogs.value = periodLogs.value.filter(log => log.id !== id);
        saveToLocal();
    };

    const cycleCharacter = () => {
        if (!characters.value || characters.value.length === 0) return;
        
        const currentIndex = characters.value.findIndex(c => Number(c.id) === Number(selectedMateCharacterId.value));
        const nextIndex = (currentIndex + 1) % characters.value.length;
        selectedMateCharacterId.value = characters.value[nextIndex].id;
        saveToLocal();
        periodCareMessage.value = '';
    };

    const generatePeriodCare = async () => {
        if (!selectedCharacter.value || !activeProfile.value) {
            alert('请先选择角色并配置AI');
            return;
        }
        
        isGeneratingCare.value = true;
        try {
            const phase = periodPhase.value;
            const phaseText = phase === 'menstrual' ? '经期' : 
                           phase === 'follicular' ? '滤泡期' : 
                           phase === 'ovulation' ? '排卵期' : 
                           phase === 'luteal' ? '黄体期' : '未知';
            
            const day = currentCycleDay.value;
            
            const prompt = `你现在要扮演角色：${selectedCharacter.value.name}。
角色人设：${selectedCharacter.value.persona || selectedCharacter.value.summary}

你的朋友现在处于月经周期的${phaseText}，第${day}天。
请根据你的性格，写一句贴心、温暖的话来关心ta。
要求：
1. 语气要符合你的人设
2. 要体现出对ta的关心和理解
3. 不要太长，1-2句话即可
4. 要自然、真诚，不要过于夸张

直接返回关心的话，不要有任何多余文字。`;

            periodCareMessage.value = (
                await callAI(
                    activeProfile.value,
                    [
                        { role: 'system', content: `你正在扮演角色：${selectedCharacter.value.name}。你只返回关心的话。` },
                        { role: 'user', content: prompt }
                    ],
                    { temperature: 0.8 }
                )
            ).trim();
            saveToLocal();
        } catch (error) {
            console.error('生成关心失败:', error);
            alert('生成关心失败，请稍后重试');
        } finally {
            isGeneratingCare.value = false;
        }
    };

    const setExerciseType = (type) => {
        if (exerciseType.value !== type) {
            exerciseType.value = type;
            exerciseTypeTransitionAt.value = Date.now();
            roleMotionState.value.rhythm = motionTypeConfig[type]?.rhythm || roleMotionState.value.rhythm;
            roleMotionState.value.mood = motionTypeConfig[type]?.mood || roleMotionState.value.mood;
            roleMotionState.value.stage = motionTypeConfig[type]?.stage || roleMotionState.value.stage;
        }
        saveToLocal();
    };

    const generateExerciseEncouragement = async () => {
        if (!selectedCharacter.value || !activeProfile.value) {
            alert('请先选择角色并配置AI');
            return;
        }
        
        isGeneratingEncouragement.value = true;
        try {
            const prompt = `你正在扮演一个虚拟陪伴角色，正在陪朋友运动。\n角色信息：\n姓名：${selectedCharacter.value.name}\n人设：${selectedCharacter.value.persona || selectedCharacter.value.summary}\n当前状态：${roleMotionState.value.stage}\n当前情绪：${roleMotionState.value.mood}\n请直接生成一句即时鼓励或陪伴的话。\n要求：1. 10-25字 2. 可以鼓励、吐槽、关心、撒娇、催促，但不要说教 3. 要像角色在对朋友说话 4. 不要提真实健康设备术语 5. 只输出一句话，不要解释，不要列表`;

            exerciseEncouragement.value = String((await callAI(
                activeProfile.value,
                [
                    { role: 'system', content: `你正在扮演角色：${selectedCharacter.value.name}。你只返回一句话。` },
                    { role: 'user', content: prompt }
                ],
                { temperature: 0.85 }
            )) || '').trim();
            roleMotionState.value.warmth = clamp(roleMotionState.value.warmth + 8, 0, 100);
            saveToLocal();
        } catch (error) {
            console.error('生成鼓励失败:', error);
            alert('生成鼓励失败，请稍后重试');
        } finally {
            isGeneratingEncouragement.value = false;
        }
    };

    const resetExerciseData = () => {
        addExerciseRecord('reset');
        roleMotionState.value = {
            vitality: 56,
            rhythm: 'calm',
            mood: 'steady',
            warmth: 42,
            progress: 18,
            stage: 'idle'
        };
        exercisePaused.value = false;
        exerciseElapsedSeconds.value = 0;
        exerciseSessionStartTime.value = null;
        exerciseEncouragement.value = '';
        currentMotionLine.value = '';
        motionRecentLines.value = [];
        if (exerciseTimer.value) {
            clearInterval(exerciseTimer.value);
            exerciseTimer.value = null;
        }
        saveToLocal();
    };

    const setStudyDuration = (minutes) => {
        focusTime.value = minutes * 60;
        saveToLocal();
    };

    const generateStudyEncouragement = async () => {
        if (!selectedCharacter.value || !activeProfile.value) {
            alert('请先选择角色并配置AI');
            return;
        }
        
        isGeneratingStudyEncouragement.value = true;
        try {
            const todaySessions = focusHistory.value.filter(h => new Date(h.date).toDateString() === new Date().toDateString());
            const sessionCount = todaySessions.length;
            const remainingTime = focusTime.value;
            const remainingMinutes = Math.floor(remainingTime / 60);
            
            const prompt = `你现在要扮演角色：${selectedCharacter.value.name}。
角色人设：${selectedCharacter.value.persona || selectedCharacter.value.summary}

你的朋友正在学习，剩余时间：${remainingMinutes}分钟，今日已完成${sessionCount}次专注学习。
请根据你的性格，写一句鼓励的话来激励ta继续学习。
要求：
1. 语气要符合你的人设
2. 要体现出对ta的鼓励和支持
3. 要积极向上，充满正能量
4. 不要太长，1-2句话即可
5. 可以根据剩余时间给出不同的鼓励

直接返回鼓励的话，不要有任何多余文字。`;

            studyEncouragement.value = (
                await callAI(
                    activeProfile.value,
                    [
                        { role: 'system', content: `你正在扮演角色：${selectedCharacter.value.name}。你只返回鼓励的话。` },
                        { role: 'user', content: prompt }
                    ],
                    { temperature: 0.8 }
                )
            ).trim();
            saveToLocal();
        } catch (error) {
            console.error('生成鼓励失败:', error);
            alert('生成鼓励失败，请稍后重试');
        } finally {
            isGeneratingStudyEncouragement.value = false;
        }
    };

    const setTargetSleepDuration = (hours) => {
        targetSleepDuration.value = hours;
        saveToLocal();
    };

    const generateSleepEncouragement = async () => {
        if (!selectedCharacter.value || !activeProfile.value) {
            alert('请先选择角色并配置AI');
            return;
        }
        
        isGeneratingSleepEncouragement.value = true;
        try {
            const todayDiaries = sleepDiaries.value.filter(d => new Date(d.date).toDateString() === new Date().toDateString());
            const diaryCount = todayDiaries.length;
            
            const prompt = `你现在要扮演角色：${selectedCharacter.value.name}。
角色人设：${selectedCharacter.value.persona || selectedCharacter.value.summary}

你的朋友准备入睡，今日已完成${diaryCount}次睡眠记录，目标睡眠时长：${targetSleepDuration.value}小时。
请根据你的性格，写一句温馨的晚安祝福或睡眠建议。
要求：
1. 语气要符合你的人设
2. 要体现出对ta的关心和温暖
3. 要温馨、柔和，有助于放松
4. 不要太长，1-2句话即可
5. 可以包含一些助眠建议

直接返回晚安祝福或建议，不要有任何多余文字。`;

            sleepEncouragement.value = (
                await callAI(
                    activeProfile.value,
                    [
                        { role: 'system', content: `你正在扮演角色：${selectedCharacter.value.name}。你只返回晚安祝福或建议。` },
                        { role: 'user', content: prompt }
                    ],
                    { temperature: 0.8 }
                )
            ).trim();
            saveToLocal();
        } catch (error) {
            console.error('生成晚安祝福失败:', error);
            alert('生成晚安祝福失败，请稍后重试');
        } finally {
            isGeneratingSleepEncouragement.value = false;
        }
    };

    const generateCharacterReply = async (type) => {
        if (!selectedCharacter.value || !activeProfile.value) {
            alert('请先选择角色并配置AI');
            return;
        }
        
        let isGeneratingRef;
        let encouragementRef;
        
        switch (type) {
            case 'study':
                isGeneratingRef = isGeneratingStudyEncouragement;
                encouragementRef = studyEncouragement;
                break;
            case 'exercise':
                isGeneratingRef = isGeneratingEncouragement;
                encouragementRef = exerciseEncouragement;
                break;
            case 'sleep':
                isGeneratingRef = isGeneratingSleepEncouragement;
                encouragementRef = sleepEncouragement;
                break;
            default:
                return;
        }
        
        isGeneratingRef.value = true;
        try {
            let activity = '';
            let context = '';
            
            switch (type) {
                case 'study': {
                    activity = '学习';
                    const todaySessions = focusHistory.value.filter(h => new Date(h.date).toDateString() === new Date().toDateString());
                    context = `当前正在${isFocusing.value ? '专注学习中' : '准备学习'}，今日已完成${todaySessions.length}次专注`;
                    break;
                }
                case 'exercise': {
                    activity = '运动';
                    const typeName = exerciseTypes.find(t => t.id === exerciseType.value)?.label || '运动';
                    context = `当前正在进行${typeName}，角色状态 ${motionStateSummary.value}，阶段 ${motionStateStageText.value}`;
                    break;
                }
                case 'sleep': {
                    activity = '睡眠';
                    context = `准备入睡，目标睡眠时长${targetSleepDuration.value}小时`;
                    break;
                }
            }
            
            const prompt = `你现在要扮演角色：${selectedCharacter.value.name}。
角色人设：${selectedCharacter.value.persona || selectedCharacter.value.summary}

你的朋友正在进行${activity}，${context}。
他们点击了你的头像，希望得到你的回应。
请根据你的性格，说一句简短的话，提醒他们不要开小差，专注于当前的${activity}。
要求：
1. 语气要符合你的人设
2. 要体现出对ta的关心和鼓励
3. 要简短有力，1-2句话即可
4. 可以带一点幽默或个性化的表达

直接返回回复内容，不要有任何多余文字。`;

            encouragementRef.value = (
                await callAI(
                    activeProfile.value,
                    [
                        { role: 'system', content: `你正在扮演角色：${selectedCharacter.value.name}。你只返回简短的回复。` },
                        { role: 'user', content: prompt }
                    ],
                    { temperature: 0.8 }
                )
            ).trim();
            saveToLocal();
        } catch (error) {
            console.error('生成角色回复失败:', error);
            alert('生成角色回复失败，请稍后重试');
        } finally {
            isGeneratingRef.value = false;
        }
    };

    const changeViewMonth = (offset) => {
        const d = new Date(currentViewDate.value);
        d.setMonth(d.getMonth() + offset);
        currentViewDate.value = d;
    };

    const viewCategoryDetail = (category) => {
        selectedCategoryDetail.value = category;
        showCategoryDetailModal.value = true;
    };

    const viewIncomeCategoryDetail = (category) => {
        selectedCategoryDetail.value = category;
        showIncomeCategoryDetailModal.value = true;
    };

    const submitExpense = async (allCharacters, activeProfileObj) => {
        if (!newExpense.value.amount) return;
        
        const expenseId = Date.now();
        const expense = {
            id: expenseId,
            amount: Number(newExpense.value.amount),
            category: newExpense.value.category,
            date: new Date(newExpense.value.date),
            description: newExpense.value.description,
            comment: null
        };

        // 如果选择了角色，则生成评论
        if (newExpense.value.selectedCharacterId && activeProfileObj && allCharacters && allCharacters.length > 0) {
            const character = allCharacters.find(c => c.id === newExpense.value.selectedCharacterId);
            if (character) {
                isGeneratingComment.value = true;
                try {
                    const commentText = await generateAiComment(expense, character, activeProfileObj);
                    expense.comment = {
                        characterId: character.id,
                        characterName: character.nickname || character.name,
                        avatarUrl: character.avatarUrl,
                        text: commentText
                    };
                } catch (error) {
                    console.error('生成角色留言失败:', error);
                } finally {
                    isGeneratingComment.value = false;
                }
            }
        }

        expenses.value.push(expense);
        calculateMonthlyExpenses();
        saveToLocal();
        showAddExpenseModal.value = false;
        newExpense.value = { 
            amount: '', 
            category: '餐饮', 
            description: '', 
            selectedCharacterId: null,
            date: new Date().toISOString().split('T')[0] 
        };
    };

    const toggleTodo = (todoId) => {
        const todo = todos.value.find(t => t.id === todoId);
        if (todo) {
            todo.completed = !todo.completed;
            saveToLocal();
        }
    };

    const submitTodo = () => {
        if (!newTodo.value.text) return;
        todos.value.push({
            id: Date.now(),
            text: newTodo.value.text,
            completed: false,
            time: newTodo.value.time ? new Date(newTodo.value.time) : new Date()
        });
        saveToLocal();
        showAddTodoModal.value = false;
        newTodo.value = { text: '', time: '' };
    };

    const submitEvent = () => {
        if (!newEvent.value.title || !newEvent.value.startTime) return;
        events.value.push({
            id: Date.now(),
            title: newEvent.value.title,
            startTime: new Date(newEvent.value.startTime),
            endTime: new Date(newEvent.value.endTime || newEvent.value.startTime),
            category: newEvent.value.category
        });
        saveToLocal();
        showAddEventModal.value = false;
        newEvent.value = { title: '', startTime: '', endTime: '', category: 'class' };
    };

    const deleteTodo = (id) => {
        todos.value = todos.value.filter(t => t.id !== id);
        saveToLocal();
    };

    const deleteEvent = (id) => {
        events.value = events.value.filter(e => e.id !== id);
        saveToLocal();
    };

    const deleteExpense = (id) => {
        expenses.value = expenses.value.filter(e => e.id !== id);
        calculateMonthlyExpenses();
        saveToLocal();
    };

    // 收入管理
    const newIncome = ref({ 
        amount: '', 
        category: '工资', 
        description: '', 
        date: new Date().toISOString().split('T')[0] 
    });
    
    const submitIncome = () => {
        if (!newIncome.value.amount) return;
        
        const incomeId = Date.now();
        const income = {
            id: incomeId,
            amount: Number(newIncome.value.amount),
            category: newIncome.value.category,
            date: new Date(newIncome.value.date),
            description: newIncome.value.description
        };

        incomes.value.push(income);
        saveToLocal();
        showAddIncomeModal.value = false;
        newIncome.value = { 
            amount: '', 
            category: '工资', 
            description: '', 
            date: new Date().toISOString().split('T')[0] 
        };
    };
    
    const deleteIncome = (id) => {
        incomes.value = incomes.value.filter(i => i.id !== id);
        saveToLocal();
    };

    // 初始金额设置
    const updateInitialBalance = (newAmount) => {
        if (newAmount === null || isNaN(newAmount)) return;
        initialBalance.value = Number(newAmount);
        saveToLocal();
    };

    const promptUpdateInitialBalance = () => {
        const b = window.prompt('请输入初始金额：', initialBalance.value);
        if (b) updateInitialBalance(b);
    };

    // 存款目标设置
    const updateSavingGoal = (newAmount) => {
        if (newAmount === null || isNaN(newAmount) || newAmount <= 0) return;
        monthlySavingGoal.value = Number(newAmount);
        saveToLocal();
    };

    const promptUpdateSavingGoal = () => {
        const b = window.prompt('请输入本月存款目标：', monthlySavingGoal.value);
        if (b) updateSavingGoal(b);
    };

    const updateBudget = (newAmount) => {
        if (newAmount === null || isNaN(newAmount) || newAmount <= 0) return;
        monthlyBudget.value = Number(newAmount);
        saveToLocal();
    };

    const promptUpdateBudget = () => {
        const b = window.prompt('请输入本月新预算：', monthlyBudget.value);
        if (b) updateBudget(b);
    };

    const promptAiBookkeep = (activeProfileObj) => {
        const text = window.prompt('请输入你的支出描述 (例如：今天中午吃拉面花了30元)');
        if (text) aiBookkeep(text, activeProfileObj);
    };

    const generateAiComment = async (expense, character, activeProfileObj) => {
        const prompt = `你现在要扮演角色：${character.name}。
角色人设：${character.persona || character.summary}
你的朋友刚刚记了一笔账：
金额：${expense.amount}元
类别：${expense.category}
描述：${expense.description}

请根据你的性格，对这笔消费发表一个简短的、有灵魂的吐槽或评价（不超过30字）。
直接返回评论内容，不要包含任何多余的文字。`;

        try {
            const text = await callAI(
                activeProfileObj,
                [
                    { role: 'system', content: `你正在扮演角色：${character.name}。请保持人设。` },
                    { role: 'user', content: prompt }
                ],
                { temperature: 0.8 }
            );
            if (text) return String(text).trim();
            return '（似乎在想别的事情...）';
        } catch (error) {
            console.error('AI 留言 API 调用失败:', error);
            throw error;
        }
    };

    const aiBookkeep = async (text, activeProfileObj) => {
        if (!text || !activeProfileObj) return;
        
        try {
            const prompt = `你是一个财务助手。请从以下文本中提取支出信息，并以 JSON 格式返回：{"amount": 数字, "category": "餐饮/交通/购物/娱乐/其他", "description": "简短描述"}。
文本内容："${text}"`;

            const content = String(
                await callAI(
                    activeProfileObj,
                    [
                        { role: 'system', content: '你只返回 JSON。' },
                        { role: 'user', content: prompt }
                    ],
                    { temperature: 0.3 }
                ) || ''
            );
            const match = content.match(/\{.*\}/s);
            if (match) {
                const result = JSON.parse(match[0]);
                newExpense.value = {
                    amount: result.amount,
                    category: result.category || '其他',
                    description: result.description || text,
                    selectedCharacterId: null,
                    date: new Date().toISOString().split('T')[0]
                };
                showAddExpenseModal.value = true;
            }
        } catch (error) {
            console.error('AI 记账失败:', error);
            alert('AI 记账暂时不可用，请手动输入');
        }
    };

    const generateSleepDiary = async () => {
        if (!selectedCharacter.value || !activeProfile.value) return;
        
        isGeneratingSleepDiary.value = true;
        try {
            // 获取相关角色的聊天记录
            const charId = selectedCharacter.value.id;
            const chatHistory = soulLinkMessages.value[charId] || [];
            const recentMessages = chatHistory.slice(-20).map(m => `${m.sender === 'user' ? '用户' : selectedCharacter.value.name}: ${m.text}`).join('\n');

            const duration = Math.floor((new Date() - (sleepStartTime.value || new Date())) / (1000 * 60));
            // 模拟一些睡眠指标
            const sleepQualityScore = Math.floor(Math.random() * 40) + 60; // 60-100
            const qualityLabel = sleepQualityScore > 90 ? '极佳' : (sleepQualityScore > 80 ? '良好' : '一般');

            const prompt = `你现在要扮演角色：${selectedCharacter.value.name}。
角色人设：${selectedCharacter.value.persona || selectedCharacter.value.summary}
你和你的朋友最近的聊天记录：
${recentMessages || '最近没有聊天。'}

你的朋友刚刚结束了一段睡眠（时长：${duration}分钟）。
请根据你的性格以及你们的聊天内容，写一份“共同睡眠观察日记”。
日记必须以 JSON 格式返回，包含以下字段：
1. "dream": 描述一个你们共同经历的梦境或关于ta的梦（浪漫、怪诞或温馨，结合人设）。
2. "events": 一个数组，记录睡眠期间的动态（如：{"time": "02:15", "action": "翻身并嘟囔了你的名字"}, {"time": "04:30", "action": "说了句梦话：'别抢我的...'" }）。
3. "quality": 对ta这次睡眠质量的评价（从你的角色视角）。
4. "message": 一句醒来后的贴心话。

直接返回 JSON 对象，不要有任何多余文字。`;

            const raw = await callAI(
                activeProfile.value,
                [
                    { role: 'system', content: `你正在扮演角色：${selectedCharacter.value.name}。你只返回 JSON 数据。` },
                    { role: 'user', content: prompt }
                ],
                { temperature: 0.8 }
            );
            const content = String(raw || '').trim();
            const match = content.match(/\{.*\}/s);
            if (match) {
                const result = JSON.parse(match[0]);
                const diary = {
                    id: Date.now(),
                    date: new Date(),
                    duration: duration,
                    characterName: selectedCharacter.value.name,
                    avatarUrl: selectedCharacter.value.avatarUrl,
                    dream: result.dream,
                    events: result.events || [],
                    quality: result.quality || qualityLabel,
                    message: result.message,
                    score: sleepQualityScore
                };
                sleepDiaries.value.unshift(diary);
                currentSleepDiary.value = diary;
                showSleepDiaryModal.value = true;
                saveToLocal();
            }
        } catch (error) {
            console.error('生成睡眠日记失败:', error);
            alert('生成睡眠日记失败，可能是 API 忙碌。');
        } finally {
            isGeneratingSleepDiary.value = false;
        }
    };
    
    const getGreeting = () => {
        const hour = currentHour.value;
        if (hour < 6) return '夜深了，早点休息吧';
        if (hour < 12) return '早上好，新的一天开始了';
        if (hour < 18) return '下午好，保持专注';
        return '晚上好，今天过得怎么样';
    };
    
    const getCurrentStatus = () => {
        if (isFocusing.value) {
            if (isPaused.value) {
                return '专注已暂停，休息一下吧';
            }
            const elapsedMinutes = Math.floor((new Date() - focusStartTime.value) / (1000 * 60));
            return `嘿，现在是专注时间，你已经坚持了 ${elapsedMinutes} 分钟`;
        }
        
        if (currentMode.value === 'exercise') {
            return `运动中，${motionStateSummary.value}`;
        }
        
        if (currentMode.value === 'sleep') {
            return '已进入深睡诱导，晚安';
        }
        
        return getGreeting();
    };

    const setMode = async (mode) => {
        if (mode === 'sleep') {
            // 进入睡眠模式，但不代表立即“入睡”
            // 只是切换界面
        } else if (currentMode.value === 'sleep' && isSleeping.value) {
            // 如果从正在入睡状态切换走，强制醒来
            await wakeUp();
        }

        currentMode.value = mode;
        if (mode === 'exercise') {
            exercisePaused.value = false;
            exerciseStarted.value = false;
            exerciseElapsedSeconds.value = 0;
            exerciseSessionStartTime.value = null;
            if (exerciseTimer.value) {
                clearInterval(exerciseTimer.value);
                exerciseTimer.value = null;
            }
            syncMotionLineTimer();
            if (!currentMotionLine.value) {
                motionLastRenderedAt.value = Date.now();
            }
        } else {
            exerciseStarted.value = false;
            exercisePaused.value = false;
            if (exerciseTimer.value) {
                clearInterval(exerciseTimer.value);
                exerciseTimer.value = null;
            }
        }
        saveToLocal();
    };
    const jumpToScene = async (mode) => {
        showQuickSceneMenu.value = false;
        await setMode(mode);
    };
    const triggerSceneEncouragement = async () => {
        if (currentMode.value === 'focus') return generateCharacterReply('study');
        if (currentMode.value === 'exercise') return generateCharacterReply('exercise');
        if (currentMode.value === 'sleep') return generateCharacterReply('sleep');
        return generatePeriodCare();
    };

    const toggleExercisePause = () => {
        exercisePaused.value = !exercisePaused.value;
        if (exercisePaused.value) {
            roleMotionState.value.stage = 'cooldown';
            roleMotionState.value.rhythm = 'calm';
            roleMotionState.value.mood = 'steady';
            if (exerciseTimer.value) {
                clearInterval(exerciseTimer.value);
                exerciseTimer.value = null;
            }
        } else {
            roleMotionState.value.stage = motionTypeConfig[exerciseType.value]?.stage || 'active';
            roleMotionState.value.rhythm = motionTypeConfig[exerciseType.value]?.rhythm || 'active';
            roleMotionState.value.mood = motionTypeConfig[exerciseType.value]?.mood || 'bright';
            if (currentMode.value === 'exercise' && exerciseStarted.value && !exerciseTimer.value) startExerciseTimer();
        }
        saveToLocal();
    };

    const finishExerciseSession = async () => {
        addExerciseRecord('finish');
        await generateExerciseDiary();
        exerciseElapsedSeconds.value = 0;
        exerciseSessionStartTime.value = null;
        exercisePaused.value = false;
        exerciseStarted.value = false;
        if (exerciseTimer.value) {
            clearInterval(exerciseTimer.value);
            exerciseTimer.value = null;
        }
        roleMotionState.value = {
            vitality: 56,
            rhythm: 'calm',
            mood: 'steady',
            warmth: 42,
            progress: 18,
            stage: 'idle'
        };
        currentMotionLine.value = '';
        motionRecentLines.value = [];
        saveToLocal();
    };

    const getCurrentExerciseRecordHistory = computed(() => {
        const characterId = selectedCharacter.value?.id;
        return exerciseRecords.value.filter(record => Number(record.characterId) === Number(characterId));
    });

    const getCurrentExerciseDiaries = computed(() => {
        const characterId = selectedCharacter.value?.id;
        return exerciseDiaries.value.filter(diary => Number(diary.characterId) === Number(characterId));
    });

    const addExerciseRecord = (endReason = 'reset') => {
        if (!exerciseElapsedSeconds.value) return;
        exerciseRecords.value.unshift({
            id: Date.now(),
            characterId: selectedCharacter.value?.id,
            characterName: selectedCharacter.value?.nickname || selectedCharacter.value?.name || '当前角色',
            startTime: exerciseSessionStartTime.value || new Date(),
            endTime: new Date(),
            durationSeconds: exerciseElapsedSeconds.value,
            durationText: formatExerciseDuration(exerciseElapsedSeconds.value),
            type: exerciseType.value,
            typeLabel: exerciseTypes.find(t => t.id === exerciseType.value)?.label || '运动',
            endReason,
            state: { ...roleMotionState.value },
            summary: currentMotionLine.value || ''
        });
        exerciseRecords.value = exerciseRecords.value.slice(0, 20);
    };



    const generateExerciseDiary = async () => {
        if (!selectedCharacter.value || !activeProfile.value || exerciseDiaryGenerating.value) return;
        exerciseDiaryGenerating.value = true;
        try {
            const durationText = formatExerciseDuration(exerciseElapsedSeconds.value);
            const prompt = `你正在扮演角色：${selectedCharacter.value.name}。
角色人设：${selectedCharacter.value.persona || selectedCharacter.value.summary}
当前运动类型：${exerciseTypes.find(t => t.id === exerciseType.value)?.label || '运动'}
本次运动时长：${durationText}
当前角色状态：${motionStateSummary.value}

请生成一段本次运动日志，像角色自己的运动日记一样。
要求：
1. 80-140字左右
2. 只能围绕本次运动过程、角色状态、陪伴感来写
3. 不要提睡眠，不要提财经，不要提其他模块
4. 语气要符合角色人设
5. 只输出正文，不要 JSON，不要解释`;

            const text = await callAI(
                activeProfile.value,
                [
                    { role: 'system', content: `你正在扮演角色：${selectedCharacter.value.name}。只输出运动日记正文。` },
                    { role: 'user', content: prompt }
                ],
                { temperature: 0.85 }
            );
            const diaryText = String(text || '').trim();
            if (!diaryText) return;
            const diary = {
                id: Date.now(),
                characterId: selectedCharacter.value.id,
                characterName: selectedCharacter.value.nickname || selectedCharacter.value.name,
                avatarUrl: selectedCharacter.value.avatarUrl,
                createdAt: new Date(),
                durationText,
                type: exerciseType.value,
                typeLabel: exerciseTypes.find(t => t.id === exerciseType.value)?.label || '运动',
                text: diaryText,
                state: { ...roleMotionState.value }
            };
            exerciseDiaries.value.unshift(diary);
            exerciseDiaries.value = exerciseDiaries.value.slice(0, 20);
            saveToLocal();
        } finally {
            exerciseDiaryGenerating.value = false;
        }
    };

    const startExerciseTimer = () => {
        if (exerciseTimer.value) clearInterval(exerciseTimer.value);
        exerciseTimer.value = setInterval(() => {
            if (currentMode.value !== 'exercise') return;
            if (exercisePaused.value) return;
            exerciseElapsedSeconds.value += 1;
            saveToLocal();
        }, 1000);
        exerciseStarted.value = true;
    };

    const startExerciseSession = () => {
        if (currentMode.value !== 'exercise') return;
        if (exerciseStarted.value) return;
        exerciseElapsedSeconds.value = 0;
        exerciseSessionStartTime.value = new Date();
        exercisePaused.value = false;
        roleMotionState.value = {
            vitality: 56,
            rhythm: 'calm',
            mood: 'steady',
            warmth: 42,
            progress: 18,
            stage: 'warmup'
        };
        currentMotionLine.value = '';
        motionRecentLines.value = [];
        startExerciseTimer();
        saveToLocal();
    };

    const openExerciseRecords = (view = 'history') => {
        exerciseRecordView.value = view;
        showExerciseRecords.value = true;
    };

    const generateCompanionNudge = async () => {
        if (!selectedCharacter.value || !activeProfile.value || isGeneratingAIVoice.value) return;
        isGeneratingAIVoice.value = true;
        try {
            const prompt = `你现在是一个温柔克制的生活陪伴者，名字叫 ${selectedCharacter.value.name}。
用户当前处于：${currentModeLabel.value}。
今日信息：${todayPanel.value.summary}，${todayPanel.value.balanceText}，${todayPanel.value.todoText}，${todayPanel.value.nextEventText}。
请只输出一句 12~24 字的陪伴提醒，不要解释，不要列表。`;
            const text = await callAI(
                activeProfile.value,
                [
                    { role: 'system', content: `你正在扮演角色：${selectedCharacter.value.name}。请保持陪伴感。` },
                    { role: 'user', content: prompt }
                ],
                { temperature: 0.85 }
            );
            if (text) {
                mateAIVoice.value = String(text).trim();
                setTimeout(() => {
                    if (mateAIVoice.value === String(text).trim()) mateAIVoice.value = null;
                }, 9000);
            }
        } catch (error) {
            console.error('生成陪伴提醒失败:', error);
        } finally {
            isGeneratingAIVoice.value = false;
        }
    };

    const startSleeping = () => {
        isSleeping.value = true;
        sleepStartTime.value = new Date();
        saveToLocal();
    };

    const wakeUp = async () => {
        if (!isSleeping.value) return;
        
        const duration = Math.floor((new Date() - (sleepStartTime.value || new Date())) / (1000 * 60));
        sleepDuration.value = duration;
        
        if (selectedMateCharacterId.value !== null && selectedMateCharacterId.value !== undefined && activeProfile.value) {
            await generateSleepDiary();
        }
        
        isSleeping.value = false;
        sleepStartTime.value = null;
        saveToLocal();
    };
    
    // 生命周期
    let timeInterval;
    
    onMounted(() => {
        timeInterval = setInterval(updateTime, 1000);
        syncMotionLineTimer();
        exerciseStarted.value = false;
        exercisePaused.value = false;
        exerciseElapsedSeconds.value = 0;
        exerciseSessionStartTime.value = null;
        if (exerciseTimer.value) {
            clearInterval(exerciseTimer.value);
            exerciseTimer.value = null;
        }
        if (currentMode.value === 'exercise' && !motionLastRenderedAt.value) {
            motionLastRenderedAt.value = Date.now();
        }
        if (selectedCharacter.value) {
            refillMotionLines(8);
        }
    });
    
    onUnmounted(() => {
        if (timeInterval) {
            clearInterval(timeInterval);
        }
        if (focusInterval) {
            clearInterval(focusInterval);
        }
        if (motionLineTimer.value) {
            clearInterval(motionLineTimer.value);
        }
        if (exerciseTimer.value) {
            clearInterval(exerciseTimer.value);
        }
        if (motionLineTransitionTimeout) {
            clearTimeout(motionLineTransitionTimeout);
        }
    });
    
    return {
        // 状态
        currentTime,
        currentMode,
        characters,
        selectedMateCharacterId,
        selectedCharacter,
        mateAIVoice,
        isGeneratingAIVoice,
        focusTime,
        isFocusing,
        isPaused,
        focusHistory,
        isGeneratingComment,
        focusTimeFormatted,
        monthlyBudget,
        monthlyExpenses,
        monthlyBalance,
        groupedExpenses,
        currentViewDate,
        selectedCategoryDetail,
        showCategoryDetailModal,
        showIncomeCategoryDetailModal,
        categoryDetails,
        incomeCategoryDetails,
        comparisonChartData,
        expenses,
        incomes,
        events,
        todos,
        steps,
        targetSteps,
        heartRate,
        exerciseType,
        exerciseTypes,
        roleMotionState,
        motionLinePool,
        currentMotionLine,
        currentMotionLineIndex,
        motionLinesForCurrentCharacter,
        motionStateSummary,
        motionStateStageText,
        clockHands,
        currentExerciseIcon,
        isSleeping,
        exercisePaused,
        sleepStartTime,
        sleepDuration,
        sleepQuality,
        sleepDiaries,
        isGeneratingSleepDiary,
        showSleepDiaryModal,
        currentSleepDiary,
        currentEvent,
        recentEvents,
        pendingTodos,
        exerciseElapsedSeconds,
        exerciseElapsedText,
        exerciseSessionStartTime,
        exerciseStarted,
        exerciseRecords: getCurrentExerciseRecordHistory,
        exerciseDiaries: getCurrentExerciseDiaries,
        exerciseDiaryGenerating,
        startExerciseSession,
        finishExerciseSession,
        showExerciseRecords,
        exerciseRecordView,
        openExerciseRecords,
        focusEncouragement,
        isGeneratingFocusEncouragement,
        generateFocusEncouragement,
        showFocusHistory,
        focusHistoryView,
        openFocusHistory,
        sceneModes,
        sceneScrollMode,
        currentSceneIndex,
        currentModeLabel,
        currentSceneMeta,
        currentAvatarUrl,
        todayPanel,
        sceneUnifiedData,
        exerciseProgress,
        containerClass,
        showAddExpenseModal,
        showAddIncomeModal,
        showAddTodoModal,
        showAddEventModal,
        showQuickSceneMenu,
        showMateChatPanel,
        showTodayPanel,
        showPeriodSettings,
        lastPeriodDate,
        cycleLength,
        periodLength,
        isPeriodToday,
        predictedNextPeriod,
        daysUntilNextPeriod,
        periodStatusText,
        periodDialogMessage,
        currentCycleDay,
        periodPhase,
        moonRingAngle,
        ovulationDay,
        historyPrediction,
        showHistoryPrediction,
        showPeriodLogs,
        periodCareMessage,
        isGeneratingCare,
        exerciseEncouragement,
        isGeneratingEncouragement,
        studyEncouragement,
        isGeneratingStudyEncouragement,
        sleepEncouragement,
        isGeneratingSleepEncouragement,
        targetSleepDuration,
        periodLogs,
        showPeriodLogModal,
        newPeriodLog,
        newExpense,
        newIncome,
        newTodo,
        newEvent,
        monthlyIncome,
        groupedIncomes,
        monthlySavingGoal,
        initialBalance,
        savingProgress,
        lastMonthExpenses,
        expenseChangePercent,
        
        // 方法
        startFocus,
        pauseFocus,
        cancelFocus,
        submitExpense,
        submitIncome,
        submitTodo,
        submitEvent,
        deleteTodo,
        deleteEvent,
        deleteExpense,
        deleteIncome,
        toggleTodo,
        updateBudget,
        promptUpdateBudget,
        updateInitialBalance,
        promptUpdateInitialBalance,
        updateSavingGoal,
        promptUpdateSavingGoal,
        promptAiBookkeep,
        setPeriodStartDate,
        changeViewMonth,
        viewCategoryDetail,
        viewIncomeCategoryDetail,
        getCurrentStatus,
        getGreeting,
        setMode,
        jumpToScene,
        triggerSceneEncouragement,
        startSleeping,
        wakeUp,
        aiBookkeep,
        generatePeriodicAIComment,
        generateSleepDiary,
        submitPeriodLog,
        deletePeriodLog,
        cycleCharacter,
        generatePeriodCare,
        setExerciseType,
        toggleExercisePause,
        generateExerciseEncouragement,
        resetExerciseData,
        addExerciseRecord,
        startExerciseTimer,
        rotateMotionLine,
        refillMotionLines,
        setStudyDuration,
        generateStudyEncouragement,
        setTargetSleepDuration,
        generateSleepEncouragement,
        generateCharacterReply,
        // 提供给模板：角色选择变更后持久化
        saveToLocal
    };
}
