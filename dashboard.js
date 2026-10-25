window.onload = async function () {
    const supabaseClient = window.spendGuardSupabase;
    if (!supabaseClient) {
        alert('Cloud account setup is missing. Follow the Supabase setup guide, then reload.');
        window.location.href = 'login.html';
        return;
    }

    const { data: authData, error: authError } = await supabaseClient.auth.getSession();
    if (authError || !authData.session) {
        window.location.href = 'login.html';
        return;
    }

    let currentUser = authData.session.user;
    const regions = window.SPENDGUARD_REGIONS || [];
    const ratesToNaira = window.SPENDGUARD_NAIRA_RATES || { NGN: 1 };
    let currentCountry = currentUser.user_metadata?.country || 'NG';
    let currentCurrency = currentUser.user_metadata?.currency || 'NGN';
    if (!ratesToNaira[currentCurrency]) currentCurrency = 'NGN';

    function sanitizePreferences(value) {
        const categoryLimits = value?.categoryLimits && typeof value.categoryLimits === 'object' && !Array.isArray(value.categoryLimits)
            ? Object.fromEntries(Object.entries(value.categoryLimits).filter(([, amount]) => Number.isFinite(Number(amount)) && Number(amount) > 0))
            : {};
        const budgetLimit = Number(value?.budgetLimit);
        return {
            budgetLimit: Number.isFinite(budgetLimit) && budgetLimit > 0 ? budgetLimit : 0,
            categoryLimits
        };
    }

    function readLocalPreferences() {
        let categoryLimits = {};
        try {
            categoryLimits = JSON.parse(localStorage.getItem('myCategoryLimits') || '{}');
        } catch (error) {
            console.warn('Saved category limits could not be read:', error);
        }
        return sanitizePreferences({
            budgetLimit: localStorage.getItem('myBudgetLimit'),
            categoryLimits
        });
    }

    function writeLocalPreferences(preferences) {
        const safePreferences = sanitizePreferences(preferences);
        if (safePreferences.budgetLimit > 0) {
            localStorage.setItem('myBudgetLimit', String(safePreferences.budgetLimit));
        } else {
            localStorage.removeItem('myBudgetLimit');
        }
        localStorage.setItem('myCategoryLimits', JSON.stringify(safePreferences.categoryLimits));
        return safePreferences;
    }

    function hasLocalPreferences() {
        return localStorage.getItem('myBudgetLimit') !== null || localStorage.getItem('myCategoryLimits') !== null;
    }

    let userPreferences = readLocalPreferences();
    const { data: savedRecord, error: loadError } = await supabaseClient
        .from('user_data')
        .select('expenses, preferences')
        .eq('user_id', currentUser.id)
        .maybeSingle();

    if (loadError) {
        console.error('Expense history could not be loaded:', loadError);
        alert('Could not load your cloud history. Check the Supabase setup and try again.');
        return;
    }

    let expenseList = Array.isArray(savedRecord?.expenses) ? savedRecord.expenses : [];
    if (!savedRecord) {
        let localExpenses = [];
        try {
            const parsedExpenses = JSON.parse(localStorage.getItem('mySavedExpenses') || '[]');
            if (Array.isArray(parsedExpenses)) localExpenses = parsedExpenses;
        } catch (error) {
            console.warn('Previous local expense data could not be read:', error);
        }

        const hasLocalData = localExpenses.length || hasLocalPreferences();
        if (hasLocalData && confirm('Use this browser\'s existing expense history and budget settings in your new account?')) {
            expenseList = localExpenses;
            userPreferences = readLocalPreferences();
        } else {
            userPreferences = { budgetLimit: 0, categoryLimits: {} };
        }

    } else if (savedRecord.preferences && Object.keys(savedRecord.preferences).length > 0) {
        userPreferences = sanitizePreferences(savedRecord.preferences);
    } else if (hasLocalPreferences() && confirm('This account has no cloud budget settings yet. Use the budget settings saved in this browser?')) {
        userPreferences = readLocalPreferences();
    } else {
        userPreferences = { budgetLimit: 0, categoryLimits: {} };
    }

    userPreferences = writeLocalPreferences(userPreferences);
    localStorage.setItem('mySavedExpenses', JSON.stringify(expenseList));

    if (!savedRecord || !savedRecord.preferences || Object.keys(savedRecord.preferences).length === 0) {
        const { error } = await supabaseClient.from('user_data').upsert({
            user_id: currentUser.id,
            expenses: expenseList,
            preferences: userPreferences,
            updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });
        if (error) {
            console.error('Initial account data could not be saved:', error);
            alert('Your account data could not be saved. Check the Supabase setup and try again.');
            return;
        }
    }
    const accountLabel = document.querySelector('#cloudSyncStatus');
    if (accountLabel) {
        accountLabel.textContent = `Signed in as ${currentUser.user_metadata?.username || currentUser.email}.`;
    }

    function formatAmount(nairaAmount) {
        const amount = (Number(nairaAmount) || 0) / ratesToNaira[currentCurrency];
        return new Intl.NumberFormat(undefined, {
            style: 'currency',
            currency: currentCurrency,
            maximumFractionDigits: 2
        }).format(amount);
    }

    function convertToNaira(amount, currency = currentCurrency) {
        return (Number(amount) || 0) * (ratesToNaira[currency] || 1);
    }

    function renderAccountSummary() {
        const username = currentUser.user_metadata?.username || currentUser.email || 'Your account';
        const usernameEl = document.querySelector('#sidebarUsername');
        const currencyEl = document.querySelector('#sidebarCurrency');
        const avatarEl = document.querySelector('#accountAvatar');
        if (usernameEl) usernameEl.textContent = username;
        if (currencyEl) currencyEl.textContent = `${currentCountry} · ${currentCurrency}`;
        if (avatarEl) avatarEl.textContent = username.charAt(0).toUpperCase();
    }

    renderAccountSummary();

    // ==========================================
    // � THEME MANAGER - Light/Dark Mode
    // ==========================================
    function initializeTheme() {
        const savedTheme = localStorage.getItem('spendGuardTheme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
        updateThemeButton(savedTheme);
    }

    function updateThemeButton(theme) {
        const btn = document.querySelector('#themeToggleBtn');
        if (btn) {
            if (theme === 'dark') {
                btn.textContent = '☀️ Light Mode';
            } else {
                btn.textContent = '🌙 Dark Mode';
            }
        }
    }

    function toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('spendGuardTheme', newTheme);
        updateThemeButton(newTheme);
        
        // Update chart if it exists
        if (window.expenseChart) {
            updateChartColors();
        }
    }

    // Initialize theme on load
    initializeTheme();

    // ==========================================
    // �🎯 DATA ENGINE
    // ==========================================
    let totalAccumulatedSpent = 0;
    let cloudSaveQueue = Promise.resolve();

    const BASE_NAIRA_RATES = ratesToNaira;

    // ==========================================
    // 🔍 HELPER FUNCTIONS
    // ==========================================
    function detectCategoryAndDesc(rawText) {
        let lower = rawText.toLowerCase();
        let result = { description: "General Expense", category: "Other" };

        if (lower.includes("food") || lower.includes("restaurant") || lower.includes("meal")) {
            result.description = "Food & Meals";
            result.category = "Food";
        } else if (lower.includes("uber") || lower.includes("transport") || lower.includes("taxi")) {
            result.description = "Commute Fare";
            result.category = "Transport";
        } else if (lower.includes("data") || lower.includes("airtel") || lower.includes("mtn")) {
            result.description = "Data Subscription";
            result.category = "Utilities";
        } else if (lower.includes("hospital") || lower.includes("medical") || lower.includes("pharmacy")) {
            result.description = "Medical Spending";
            result.category = "Medical";
        }
        return result;
    }

    function parseExpenseAmount(rawText) {
        const numericMatches = Array.from(rawText.matchAll(/(?:₦|NGN|US\$|\$|£|GBP|€|EUR|C\$|A\$|GHS|KES|ZAR|₹|¥)?\s?([\d,]+(?:\.\d{1,2})?)/gi));
        const match = numericMatches.find(candidate => Number.isFinite(parseFloat(candidate[1].replace(/,/g, ''))));
        const amount = match ? parseFloat(match[1].replace(/,/g, '')) : parseSpokenNumber(rawText);
        if (!Number.isFinite(amount) || amount <= 0) return null;

        const text = rawText.toUpperCase();
        let currency = currentCurrency;
        if (text.includes('₦') || /\bNGN\b|\bNAIRA\b/.test(text)) currency = 'NGN';
        else if (text.includes('£') || /\bGBP\b|\bPOUNDS?\b|\bSTERLING\b/.test(text)) currency = 'GBP';
        else if (text.includes('€') || /\bEUR\b|\bEUROS?\b/.test(text)) currency = 'EUR';
        else if (text.includes('₹') || /\bINR\b|\bRUPEES?\b/.test(text)) currency = 'INR';
        else if (text.includes('¥') || /\bJPY\b|\bYEN\b/.test(text)) currency = 'JPY';
        else if (text.includes('C$') || /\bCAD\b|\bCANADIAN DOLLARS?\b/.test(text)) currency = 'CAD';
        else if (text.includes('A$') || /\bAUD\b|\bAUSTRALIAN DOLLARS?\b/.test(text)) currency = 'AUD';
        else if (/\bGHS\b|\bCEDIS?\b/.test(text)) currency = 'GHS';
        else if (/\bKES\b|\bKENYAN SHILLINGS?\b/.test(text)) currency = 'KES';
        else if (/\bZAR\b|\bRAND\b/.test(text)) currency = 'ZAR';
        else if (text.includes('US$') || /\bUSD\b/.test(text)) currency = 'USD';
        else if (text.includes('$') || /\bDOL?LARS?\b|\bBUCKS?\b/.test(text)) {
            currency = ['USD', 'CAD', 'AUD'].includes(currentCurrency) ? currentCurrency : 'USD';
        }

        return { amount, currency };
    }

    function parseSpokenNumber(rawText) {
        const numberWords = 'zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|and';
        const amountPhrase = rawText.toLowerCase().match(new RegExp(`\\b((?:(?:${numberWords})\\s*)+)(?:dollars?|dolars?|bucks?|pounds?|euros?|naira|rupees?|yen|rand|cedis?|shillings?)?\\s*$`));
        const tokens = amountPhrase?.[1].match(new RegExp(`\\b(?:${numberWords})\\b`, 'g'));
        if (!tokens) return NaN;

        const values = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
        let total = 0;
        let current = 0;
        tokens.forEach(token => {
            if (token === 'and') return;
            if (token === 'hundred') current = Math.max(current, 1) * 100;
            else if (token === 'thousand' || token === 'million') {
                total += Math.max(current, 1) * (token === 'thousand' ? 1000 : 1000000);
                current = 0;
            } else current += values[token];
        });
        return total + current;
    }

    function saveExpense(desc, cat, amount, currency = currentCurrency) {
        const expense = {
            description: desc,
            category: cat,
            amount: convertToNaira(amount, currency),
            date: new Date().toISOString()
        };
        expenseList.push(expense);
        persistExpenses();
        updateAllDisplays();
    }

    function persistExpenses() {
        localStorage.setItem('mySavedExpenses', JSON.stringify(expenseList));
        const expensesSnapshot = expenseList.map(expense => ({ ...expense }));
        cloudSaveQueue = cloudSaveQueue.then(async function () {
            const { error } = await supabaseClient.from('user_data').upsert({
                user_id: currentUser.id,
                expenses: expensesSnapshot,
                preferences: readLocalPreferences(),
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_id' });

            if (error) throw error;
            if (accountLabel) accountLabel.textContent = `Signed in as ${currentUser.user_metadata?.username || currentUser.email}. All expenses synced.`;
        }).catch(function (error) {
            console.error('Expense history could not be synced:', error);
            if (accountLabel) accountLabel.textContent = 'Cloud sync failed. Your latest changes are saved only in this browser.';
        });
    }

    function updateAllDisplays() {
        console.log("📊 Updating all displays...");
        renderTable();
        updateBudgetCards();
        renderCategoryLimits();
        updateChart();
        updateSpendyReport();
    }

    function renderTable() {
        const table = document.querySelector('#expenseTableBody');
        if (!table) return;

        table.innerHTML = "<tr style='font-weight:bold; background:#f0f0f0;'><td>Description</td><td>Category</td><td>Amount</td></tr>";

        expenseList.forEach(exp => {
            const tr = document.createElement('tr');
            const descriptionCell = document.createElement('td');
            descriptionCell.textContent = exp.description || 'Expense';

            const categoryCell = document.createElement('td');
            const categoryLabel = document.createElement('strong');
            categoryLabel.textContent = exp.category || 'Other';
            categoryCell.appendChild(categoryLabel);

            const amountCell = document.createElement('td');
            amountCell.textContent = formatAmount(exp.amount);

            tr.append(descriptionCell, categoryCell, amountCell);
            table.appendChild(tr);
        });
    }

    function updateBudgetCards() {
        const today = new Date();
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth();

        let totalWeek = 0, totalMonth = 0, totalYear = 0;

        expenseList.forEach(exp => {
            const amount = parseFloat(exp.amount) || 0;
            const expDate = exp.date ? new Date(exp.date) : today;

            if (expDate.getFullYear() === currentYear) {
                totalYear += amount;
                if (expDate.getMonth() === currentMonth) {
                    totalMonth += amount;
                }
                const dayDiff = (today - expDate) / (1000 * 60 * 60 * 24);
                if (dayDiff <= 7) {
                    totalWeek += amount;
                }
            }
        });

        totalAccumulatedSpent = totalMonth;

        // Update display cards
        const weekEl = document.querySelector('#weekSpent');
        const monthEl = document.querySelector('#totalSpent');
        const yearEl = document.querySelector('#yearSpent');
        const limitEl = document.querySelector('#totalLimit');
        const budgetEl = document.querySelector('#overBudgetAmount');

        if (weekEl) weekEl.innerText = formatAmount(totalWeek);
        if (monthEl) monthEl.innerText = formatAmount(totalMonth);
        if (yearEl) yearEl.innerText = formatAmount(totalYear);

        // Budget limit
        const budgetLimit = parseFloat(localStorage.getItem('myBudgetLimit')) || 0;
        if (limitEl) {
            limitEl.innerText = formatAmount(budgetLimit);
        }

        // Over budget
        let overBudget = 0;
        const categoryLimits = JSON.parse(localStorage.getItem('myCategoryLimits')) || {};
        for (let cat in categoryLimits) {
            const spent = expenseList.filter(e => e.category === cat).reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
            if (spent > categoryLimits[cat]) {
                overBudget += (spent - categoryLimits[cat]);
            }
        }
        if (budgetEl) budgetEl.innerText = formatAmount(overBudget);
    }

    function renderCategoryLimits() {
        const list = document.querySelector('#categoryLimitsList');
        if (!list) return;
        
        list.innerHTML = "";
        const limits = JSON.parse(localStorage.getItem('myCategoryLimits')) || {};
        
        for (let cat in limits) {
            const li = document.createElement('li');
            li.textContent = `${cat}: ${formatAmount(limits[cat])}`;
            list.appendChild(li);
        }
    }

    // ==========================================
    // 📊 CHART SETUP
    // ==========================================
    let expenseChart = null;

    function localDateKey(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function getWeekStart(date) {
        const weekStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const daysFromMonday = (weekStart.getDay() + 6) % 7;
        weekStart.setDate(weekStart.getDate() - daysFromMonday);
        return weekStart;
    }

    function initializeChart() {
        const ctx = document.getElementById('expenseChart');
        if (!ctx) return;

        expenseChart = new Chart(ctx, {
            type: 'bar',
            data: { labels: [], datasets: [{ label: 'Expenses', data: [], backgroundColor: '#138a72', borderRadius: 5, maxBarThickness: 42 }] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: context => formatAmount(context.parsed.y ?? context.parsed) } }
                },
                scales: {
                    x: { grid: { display: false }, ticks: { color: '#71817d' } },
                    y: { beginAtZero: true, ticks: { color: '#71817d', callback: value => formatAmount(value) } }
                }
            }
        });
    }

    function updateChart() {
        if (!expenseChart) return;
        const view = document.querySelector('#chartView')?.value || 'category';
        const grouping = document.querySelector('#chartGrouping')?.value || 'day';
        const startValue = document.querySelector('#chartStartDate')?.value;
        const endValue = document.querySelector('#chartEndDate')?.value;
        const summary = document.querySelector('#chartSummary');
        const startDate = startValue ? new Date(`${startValue}T00:00:00`) : null;
        const endDate = endValue ? new Date(`${endValue}T23:59:59.999`) : null;

        if ((startDate && Number.isNaN(startDate.getTime())) || (endDate && Number.isNaN(endDate.getTime())) || (startDate && endDate && startDate > endDate)) {
            if (summary) summary.textContent = 'Choose a valid date range.';
            expenseChart.data.labels = [];
            expenseChart.data.datasets[0].data = [];
            renderChartExpenseDetails([]);
            expenseChart.update();
            return;
        }

        const filteredExpenses = expenseList.filter(expense => {
            const date = new Date(expense.date);
            return !Number.isNaN(date.getTime()) && (!startDate || date >= startDate) && (!endDate || date <= endDate);
        });
        const totals = {};

        filteredExpenses.forEach(expense => {
            const amount = Number(expense.amount) || 0;
            let key;
            if (view === 'category') {
                key = expense.category || 'Other';
            } else if (view === 'item') {
                key = expense.description || 'Expense';
            } else {
                const date = new Date(expense.date);
                if (grouping === 'month') {
                    key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                } else if (grouping === 'week') {
                    key = localDateKey(getWeekStart(date));
                } else {
                    key = localDateKey(date);
                }
            }
            totals[key] = (totals[key] || 0) + amount;
        });

        const keys = Object.keys(totals).sort();
        const labels = keys.map(key => {
            if (view === 'category' || view === 'item') return key;
            const date = new Date(`${key}T00:00:00`);
            return grouping === 'month'
                ? new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric' }).format(date)
                : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
        });
        const data = keys.map(key => totals[key]);
        const total = data.reduce((sum, amount) => sum + amount, 0);
        const rangeLabel = `${startValue || 'all time'} to ${endValue || 'today'}`;

        expenseChart.config.type = view === 'category' ? 'doughnut' : 'bar';
        expenseChart.data.labels = labels.length ? labels : ['No expenses in this range'];
        expenseChart.data.datasets[0].label = view === 'category' ? 'Expenses by category' : view === 'item' ? 'Expenses by item' : 'Expenses';
        expenseChart.data.datasets[0].data = labels.length ? data : [0];
        expenseChart.data.datasets[0].backgroundColor = view === 'category'
            ? ['#138a72', '#e99566', '#e2bd53', '#4c86a8', '#b56d80', '#87aa78', '#67759c']
            : '#138a72';
        expenseChart.options.plugins.legend.display = view === 'category';
        expenseChart.options.scales = view === 'category' ? {} : {
            x: { grid: { display: false }, ticks: { color: '#71817d' } },
            y: { beginAtZero: true, ticks: { color: '#71817d', callback: value => formatAmount(value) } }
        };
        if (summary) summary.textContent = `${filteredExpenses.length} expenses · ${formatAmount(total)} total · ${rangeLabel}`;
        renderChartExpenseDetails(filteredExpenses);
        expenseChart.update();
    }

    function renderChartExpenseDetails(expenses) {
        const table = document.querySelector('#chartExpenseTable');
        if (!table) return;
        table.replaceChildren();

        const header = table.insertRow();
        ['Date', 'Item', 'Category', 'Amount'].forEach(label => {
            const cell = document.createElement('th');
            cell.textContent = label;
            header.appendChild(cell);
        });

        expenses.slice().sort((left, right) => new Date(right.date) - new Date(left.date)).forEach(expense => {
            const row = table.insertRow();
            const dateCell = row.insertCell();
            dateCell.textContent = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(expense.date));
            row.insertCell().textContent = expense.description || 'Expense';
            row.insertCell().textContent = expense.category || 'Other';
            row.insertCell().textContent = formatAmount(expense.amount);
        });

        if (!expenses.length) {
            const row = table.insertRow();
            const cell = row.insertCell();
            cell.colSpan = 4;
            cell.textContent = 'No expenses match this date range.';
        }
    }

    function getSpendingReport() {
        const today = new Date();
        const monthExpenses = expenseList.filter(expense => {
            const date = new Date(expense.date);
            return !Number.isNaN(date.getTime()) && date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth();
        });
        const monthTotal = monthExpenses.reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);
        const categoryTotals = {};
        monthExpenses.forEach(expense => {
            const category = expense.category || 'Other';
            categoryTotals[category] = (categoryTotals[category] || 0) + (Number(expense.amount) || 0);
        });

        const topCategory = Object.entries(categoryTotals).sort((left, right) => right[1] - left[1])[0];
        const monthlyBudget = Number(localStorage.getItem('myBudgetLimit')) || 0;
        let advice;
        if (!monthExpenses.length) {
            advice = 'No expenses are logged this month yet. Add an expense to start your report.';
        } else if (monthlyBudget > 0 && monthTotal > monthlyBudget) {
            advice = `You are ${formatAmount(monthTotal - monthlyBudget)} over your monthly budget. Consider pausing optional purchases and reviewing your largest category.`;
        } else if (monthlyBudget > 0) {
            advice = `You have ${formatAmount(monthlyBudget - monthTotal)} left in your monthly budget. Keep checking your totals as you log expenses.`;
        } else if (topCategory) {
            advice = `${topCategory[0]} is your largest category this month. You could set a category limit to keep an eye on it.`;
        } else {
            advice = 'Set a monthly budget to get more specific spending guidance.';
        }

        const summary = `This month: ${monthExpenses.length} expenses totaling ${formatAmount(monthTotal)}.`;
        const categorySummary = topCategory ? ` Largest category: ${topCategory[0]} at ${formatAmount(topCategory[1])}.` : '';
        return { text: `${summary}${categorySummary} ${advice}`, monthTotal, monthExpenses, advice };
    }

    function getAiSummaryData() {
        const report = getSpendingReport();
        const categoryTotals = {};
        report.monthExpenses.forEach(expense => {
            const category = expense.category || 'Other';
            categoryTotals[category] = (categoryTotals[category] || 0) + (Number(expense.amount) || 0);
        });

        return {
            currency: currentCurrency,
            period: new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(new Date()),
            total: report.monthTotal / ratesToNaira[currentCurrency],
            budget: (Number(localStorage.getItem('myBudgetLimit')) || 0) / ratesToNaira[currentCurrency],
            count: report.monthExpenses.length,
            categories: Object.entries(categoryTotals)
                .sort((left, right) => right[1] - left[1])
                .slice(0, 12)
                .map(([name, amount]) => ({ name, amount: amount / ratesToNaira[currentCurrency] }))
        };
    }

    async function requestAiAdvice(question) {
        const { data, error } = await supabaseClient.auth.getSession();
        if (error || !data.session?.access_token) throw new Error('Please sign in again before asking Spendy for AI advice.');

        const configuredEndpoint = window.SPENDGUARD_AI_ENDPOINT?.trim();
        if (!configuredEndpoint) {
            throw new Error('Spendy AI is not connected yet. Set SPENDGUARD_AI_ENDPOINT in supabase-config.js to your Netlify function URL.');
        }

        let endpoint;
        try {
            endpoint = new URL(configuredEndpoint);
        } catch {
            throw new Error('Spendy AI has an invalid function URL. Check SPENDGUARD_AI_ENDPOINT in supabase-config.js.');
        }
        if (
            endpoint.protocol !== 'https:' ||
            !endpoint.pathname.endsWith('/.netlify/functions/spendy-advice') ||
            endpoint.username ||
            endpoint.password
        ) {
            throw new Error('Spendy AI needs a secure Netlify function URL ending in /.netlify/functions/spendy-advice.');
        }

        const response = await fetch(endpoint.href, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${data.session.access_token}`
            },
            body: JSON.stringify({ question, summary: getAiSummaryData() })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Spendy AI is unavailable right now.');
        return result.advice;
    }

    function updateSpendyReport() {
        const response = document.querySelector('#spendyResponse');
        if (response) response.textContent = getSpendingReport().text;
    }

    function speakSpendy(text) {
        if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) return false;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
        return true;
    }

    function handleSpendyCommand(command, speakResponse = false) {
        const response = document.querySelector('#spendyResponse');
        const normalized = command.trim();
        if (!normalized) {
            response.textContent = 'Say or type an expense, such as “Food 200 dollars,” or ask for a spending report.';
            return;
        }

        if (/^(hi|hello|hey|good morning|good afternoon|good evening)[!.? ]*$/i.test(normalized)) {
            response.textContent = "Hi, I'm Spendy, nice to meet you! You can ask for a spending report or tell me an expense to log.";
            if (speakResponse) speakSpendy(response.textContent);
            return;
        }

        if (/\b(what can you do|help|how do i use you)\b/i.test(normalized)) {
            response.textContent = 'I can summarize this month, offer a budget nudge, and log an expense. Try “Food 200 dollars” or ask “How much did I spend this month?”';
            if (speakResponse) speakSpendy(response.textContent);
            return;
        }

        if (/\b(report|summary|summari[sz]e|advice|tips?|spending report|how much did i spend|what am i spending (?:the )?most on|analy[sz]e my spending)\b/i.test(normalized)) {
            const report = getSpendingReport();
            response.textContent = report.text;
            if (speakResponse) speakSpendy(report.text);
            return;
        }

        const parsed = parseExpenseAmount(normalized);
        if (!parsed) {
            response.textContent = 'I could not find an amount. Try something like “Food 200 dollars.”';
            return;
        }

        const description = normalized
            .replace(/(?:₦|NGN|US\$|\$|£|GBP|€|EUR|C\$|A\$|GHS|KES|ZAR|₹|¥)?\s?\d[\d,]*(?:\.\d{1,2})?/i, ' ')
            .replace(/\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|and)\b/gi, ' ')
            .replace(/\b(?:dollars?|dolars?|bucks?|pounds?|sterling|euros?|naira|rupees?|yen|rand|cedis?|shillings?|canadian|australian|us|i|spent|spend|log|add|record|expense|expenses|for|on|at|today|please)\b/gi, ' ')
            .replace(/\b(?:NGN|USD|GBP|EUR|CAD|AUD|GHS|KES|ZAR|INR|JPY)\b/gi, ' ')
            .replace(/\s+/g, ' ')
            .replace(/^[\s,.-]+|[\s,.-]+$/g, '');

        if (!description) {
            response.textContent = 'What was the expense for? Try “Food 200 dollars.”';
            return;
        }

        const categoryInfo = detectCategoryAndDesc(description);
        if (categoryInfo.category === 'Other' && /\b(coffee|groceries|grocery|breakfast|lunch|dinner|snack|restaurant|meal)\b/i.test(description)) {
            categoryInfo.category = 'Food';
        }
        const itemName = description.charAt(0).toUpperCase() + description.slice(1);
        saveExpense(itemName, categoryInfo.category, parsed.amount, parsed.currency);
        const confirmation = `Logged ${itemName} for ${formatAmount(convertToNaira(parsed.amount, parsed.currency))}.`;
        response.textContent = `${confirmation} ${getSpendingReport().text}`;
        document.querySelector('#spendyCommand').value = '';
        if (speakResponse) speakSpendy(confirmation);
    }

    function updateChartColors() {
        if (!expenseChart) return;
        
        const theme = document.documentElement.getAttribute('data-theme') || 'light';
        const isDark = theme === 'dark';
        
        // Update chart label and legend colors based on theme
        const labelColor = isDark ? '#f1f5f9' : '#2c3e50';
        
        expenseChart.options.plugins.legend.labels.color = labelColor;
        expenseChart.options.plugins.tooltip.titleColor = labelColor;
        expenseChart.options.plugins.tooltip.bodyColor = labelColor;
        
        // Update border color for dark mode
        expenseChart.data.datasets[0].borderColor = isDark ? '#1a2332' : '#fff';
        
        expenseChart.update();
    }

    // ==========================================
    // ⚙️ INITIALIZE
    // ==========================================
    const currencyOptions = Array.from(new Set(regions.map(region => region.currency)));
    ['#fromCurrency', '#toCurrency'].forEach(selector => {
        const select = document.querySelector(selector);
        if (!select) return;
        select.replaceChildren(...currencyOptions.map(currency => new Option(currency, currency)));
    });
    document.querySelector('#fromCurrency').value = currentCurrency;
    document.querySelector('#toCurrency').value = currentCurrency;

    const settingsCountry = document.querySelector('#settingsCountry');
    regions.forEach(region => settingsCountry.add(new Option(`${region.country} (${region.currency})`, region.code)));
    settingsCountry.value = currentCountry;
    document.querySelector('#settingsUsername').value = currentUser.user_metadata?.username || '';
    document.querySelector('#settingsCurrencyLabel').textContent = `Currency: ${currentCurrency}. Exchange rates are estimates and are not live market quotes.`;

    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 29);
    document.querySelector('#chartStartDate').value = localDateKey(thirtyDaysAgo);
    document.querySelector('#chartEndDate').value = localDateKey(today);
    document.querySelector('#chartView').value = 'category';
    document.querySelector('#chartGrouping').disabled = true;

    initializeChart();
    updateAllDisplays();

    // ==========================================
    // 🔔 AUTOMATIC SMS NOTIFICATION HANDLER
    // ==========================================
    // Register service worker for automatic SMS detection
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./service-worker.js').catch(err => {
            console.log('Service Worker registration failed:', err);
        });

        // Listen for incoming SMS messages from service worker
        navigator.serviceWorker.addEventListener('message', function(event) {
            if (event.data.type === 'NEW_SMS_BATCH') {
                event.data.smsMessages.forEach(msg => {
                    processIncomingSMS(msg.sms);
                });
            }
        });
    }

    // Request notification permission for bank alerts
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                console.log('✅ Notifications enabled for bank alerts');
                // Request background sync
                if ('serviceWorker' in navigator && 'SyncManager' in window) {
                    navigator.serviceWorker.ready.then(registration => {
                        registration.sync.register('sync-expenses').catch(err => {
                            console.log('Background sync not available:', err);
                        });
                    });
                }
            }
        });
    }

    // ==========================================
    // 📱 PROCESS INCOMING SMS AUTOMATICALLY
    // ==========================================
    function processIncomingSMS(smsText) {
        if (!smsText) return;

        // Extract amount
        const parsedAmount = parseExpenseAmount(smsText);
        const amount = parsedAmount?.amount || 0;

        if (amount > 0) {
            // Detect category
            const catInfo = detectCategoryAndDesc(smsText);
            
            // Auto-save expense
            saveExpense(`[Auto] ${catInfo.description}`, catInfo.category, amount, parsedAmount.currency);

            // Show desktop notification
            if ('Notification' in window && Notification.permission === 'granted') {
                new Notification('💰 Expense Parsed', {
                    body: `${catInfo.description}: ${formatAmount(convertToNaira(amount, parsedAmount.currency))}`,
                    icon: './manifest.json',
                    tag: 'auto-expense'
                });
            }

            // Log to console
            console.log(`📊 Parsed notification text: ${catInfo.category} - ${formatAmount(convertToNaira(amount, parsedAmount.currency))}`);

            // Tell service worker we processed this SMS
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.controller?.postMessage({
                    type: 'SMS_PROCESSED',
                    sms: smsText
                });
            }
        }
    }

    // Listen for incoming SMS via message events (for manual testing)
    window.addEventListener('message', function(event) {
        if (event.data && event.data.type === 'INCOMING_SMS') {
            processIncomingSMS(event.data.smsText);
        }
    });

    // Expose auto-processing function globally for testing
    window.processIncomingSMS = processIncomingSMS;

    // ==========================================
    // 🎯 EVENT LISTENERS
    // ==========================================

    // Theme Toggle
    const themeToggleBtn = document.querySelector('#themeToggleBtn');
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', toggleTheme);
    }

    // Budget Limit
    const saveLimitBtn = document.querySelector('#saveLimitBtn');
    if (saveLimitBtn) {
        saveLimitBtn.addEventListener('click', function () {
            const limit = parseFloat(document.querySelector('#budgetLimitInput').value);
            if (limit > 0) {
                const budgetInNaira = convertToNaira(limit);
                localStorage.setItem('myBudgetLimit', budgetInNaira);
                userPreferences = readLocalPreferences();
                persistExpenses();
                alert(`✅ Budget set to ${formatAmount(budgetInNaira)}`);
                document.querySelector('#budgetLimitInput').value = "";
                updateBudgetCards();
                updateSpendyReport();
            } else {
                alert("❌ Please enter a valid amount!");
            }
        });
    }

    // Category Budget
    const saveCatLimitBtn = document.querySelector('#saveCategoryLimitBtn');
    if (saveCatLimitBtn) {
        saveCatLimitBtn.addEventListener('click', function () {
            const catName = document.querySelector('#categoryNameInput').value.trim();
            const catLimit = parseFloat(document.querySelector('#categoryLimitInput').value);
            
            if (catName && catLimit > 0) {
                let limits = JSON.parse(localStorage.getItem('myCategoryLimits')) || {};
                limits[catName] = convertToNaira(catLimit);
                localStorage.setItem('myCategoryLimits', JSON.stringify(limits));
                userPreferences = readLocalPreferences();
                persistExpenses();
                alert(`✅ Category limit set!`);
                document.querySelector('#categoryNameInput').value = "";
                document.querySelector('#categoryLimitInput').value = "";
                updateAllDisplays();
            } else {
                alert("❌ Invalid category or limit!");
            }
        });
    }

    // Currency Converter
    const convertBtn = document.querySelector('#convertBtn');
    if (convertBtn) {
        convertBtn.addEventListener('click', function () {
            const amount = parseFloat(document.querySelector('#convertAmountInput').value);
            const from = document.querySelector('#fromCurrency').value;
            const to = document.querySelector('#toCurrency').value;
            const desc = document.querySelector('#convertDescInput').value.trim() || from;

            if (isNaN(amount) || amount <= 0) {
                alert("❌ Invalid amount!");
                return;
            }

            const fromRate = BASE_NAIRA_RATES[from];
            const toRate = BASE_NAIRA_RATES[to];
            const converted = (amount * fromRate) / toRate;

            const convertedText = new Intl.NumberFormat(undefined, { style: 'currency', currency: to, maximumFractionDigits: 2 }).format(converted);
            document.querySelector('#convertOutput').innerText = `✅ ${amount} ${from} = ${convertedText}`;

            if (to === currentCurrency) {
                const catInfo = detectCategoryAndDesc(desc);
                saveExpense(`${desc} (${amount} ${from})`, catInfo.category, converted, to);
                document.querySelector('#convertAmountInput').value = "";
                document.querySelector('#convertDescInput').value = "";
            }
        });
    }

    // SMS Parser
    const parseBtn = document.querySelector('#parseBtn');
    if (parseBtn) {
        parseBtn.addEventListener('click', function () {
            const sms = document.querySelector('#smsInput').value.trim();
            if (!sms) {
                alert("❌ Enter SMS text!");
                return;
            }

            const parsedAmount = parseExpenseAmount(sms);
            const amount = parsedAmount?.amount || 0;
            const catInfo = detectCategoryAndDesc(sms);

            if (amount > 0) {
                saveExpense(catInfo.description, catInfo.category, amount, parsedAmount.currency);
                document.querySelector('#smsOutput').innerText = `✅ ${catInfo.description} - ${formatAmount(convertToNaira(amount, parsedAmount.currency))}`;
                document.querySelector('#smsInput').value = "";
            } else {
                document.querySelector('#smsOutput').innerText = "❌ No amount found!";
            }
        });
    }

    // CSV Import and Backup
    function parseCsvRows(text) {
        const rows = [];
        let row = [];
        let field = '';
        let insideQuotes = false;

        for (let index = 0; index < text.length; index++) {
            const character = text[index];
            if (insideQuotes) {
                if (character === '"' && text[index + 1] === '"') {
                    field += '"';
                    index++;
                } else if (character === '"') {
                    insideQuotes = false;
                } else {
                    field += character;
                }
            } else if (character === '"' && field.length === 0) {
                insideQuotes = true;
            } else if (character === ',') {
                row.push(field);
                field = '';
            } else if (character === '\n' || character === '\r') {
                if (character === '\r' && text[index + 1] === '\n') index++;
                row.push(field);
                if (row.some(value => value.trim() !== '')) rows.push(row);
                row = [];
                field = '';
            } else {
                field += character;
            }
        }

        if (insideQuotes) throw new Error('The CSV has an unclosed quoted field.');
        row.push(field);
        if (row.some(value => value.trim() !== '')) rows.push(row);
        return rows;
    }

    function normalizeCsvHeader(value) {
        return value.replace(/^\uFEFF/, '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    }

    function parseCsvDate(value) {
        const text = value.trim();
        if (!text) return new Date();

        const dayFirst = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
        const date = dayFirst
            ? new Date(Number(dayFirst[3]), Number(dayFirst[2]) - 1, Number(dayFirst[1]))
            : new Date(text);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    function parseCsvAmount(value) {
        const normalized = value.trim().replace(/^\((.*)\)$/, '-$1').replace(/[\s,]/g, '').replace(/[^\d.+-]/g, '');
        const amount = Number(normalized);
        return Number.isFinite(amount) && amount !== 0 ? Math.abs(amount) : null;
    }

    function expenseDuplicateKey(expense) {
        const date = new Date(expense.date);
        const dateKey = Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
        return [
            (expense.description || '').trim().toLowerCase().replace(/\s+/g, ' '),
            (expense.category || '').trim().toLowerCase(),
            (Number(expense.amount) || 0).toFixed(2),
            dateKey
        ].join('|');
    }

    function parseBankCsv(text) {
        const rows = parseCsvRows(text);
        if (!rows.length) return { expenses: [], invalid: 0 };

        const headers = rows[0].map(normalizeCsvHeader);
        const findColumn = aliases => headers.findIndex(header => aliases.includes(header));
        let descriptionIndex = findColumn(['description', 'merchant', 'name', 'item', 'details', 'narration', 'transaction details', 'transaction description', 'payee']);
        let categoryIndex = findColumn(['category', 'expense category']);
        let amountIndex = findColumn(['debit', 'withdrawal', 'withdrawals', 'spent', 'expense', 'amount', 'transaction amount', 'total', 'value']);
        let dateIndex = findColumn(['date', 'transaction date', 'posted date', 'timestamp']);
        let currencyIndex = findColumn(['currency', 'currency code']);
        let firstDataRow = 1;

        const hasHeader = descriptionIndex >= 0 && amountIndex >= 0;
        if (!hasHeader) {
            firstDataRow = 0;
            const firstRowLooksDated = rows[0].length >= 4 && parseCsvDate(rows[0][0]);
            if (firstRowLooksDated) {
                [dateIndex, descriptionIndex, categoryIndex, amountIndex, currencyIndex] = [0, 1, 2, 3, 4];
            } else {
                [descriptionIndex, categoryIndex, amountIndex, dateIndex, currencyIndex] = [0, 1, 2, 3, 4];
            }
        }

        if (descriptionIndex < 0 || amountIndex < 0) {
            throw new Error('Could not find description and amount columns. Include headers such as Description and Amount, or use Description, Category, Amount columns.');
        }

        const expenses = [];
        let invalid = 0;
        rows.slice(firstDataRow).forEach(row => {
            const description = (row[descriptionIndex] || '').trim();
            const rawAmount = row[amountIndex] || '';
            const amount = parseCsvAmount(rawAmount);
            const date = dateIndex >= 0 ? parseCsvDate(row[dateIndex] || '') : new Date();
            if (!description || amount === null || !date) {
                invalid++;
                return;
            }

            const categoryText = categoryIndex >= 0 ? (row[categoryIndex] || '').trim() : '';
            const categoryInfo = detectCategoryAndDesc(`${description} ${categoryText}`);
            const category = categoryText || categoryInfo.category;
            const currencyText = currencyIndex >= 0 ? (row[currencyIndex] || '').trim().toUpperCase() : '';
            const parsedCurrency = parseExpenseAmount(`${rawAmount} ${currencyText}`)?.currency || currentCurrency;
            if (!ratesToNaira[parsedCurrency]) {
                invalid++;
                return;
            }

            expenses.push({
                description,
                category,
                amount: convertToNaira(amount, parsedCurrency),
                date: date.toISOString()
            });
        });

        return { expenses, invalid };
    }

    const csvInput = document.querySelector('#bankFileInput');
    const csvImportStatus = document.querySelector('#csvImportStatus');
    if (csvInput) {
        csvInput.addEventListener('change', function (event) {
            const file = event.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = function (loadEvent) {
                try {
                    const parsed = parseBankCsv(String(loadEvent.target.result || ''));
                    const existingKeys = new Set(expenseList.map(expenseDuplicateKey));
                    const additions = [];
                    let duplicates = 0;

                    parsed.expenses.forEach(expense => {
                        const key = expenseDuplicateKey(expense);
                        if (existingKeys.has(key)) {
                            duplicates++;
                        } else {
                            existingKeys.add(key);
                            additions.push(expense);
                        }
                    });

                    if (!additions.length) {
                        csvImportStatus.textContent = `Nothing to import. ${duplicates} duplicate rows skipped; ${parsed.invalid} invalid rows ignored.`;
                        return;
                    }

                    const accepted = confirm(`Import ${additions.length} expenses?\n\n${duplicates} duplicate rows will be skipped.\n${parsed.invalid} invalid rows will be ignored.`);
                    if (!accepted) {
                        csvImportStatus.textContent = 'Import cancelled. Your expense history was not changed.';
                        return;
                    }

                    expenseList = expenseList.concat(additions);
                    persistExpenses();
                    updateAllDisplays();
                    csvImportStatus.textContent = `Imported ${additions.length} expenses. Skipped ${duplicates} duplicates and ${parsed.invalid} invalid rows.`;
                } catch (error) {
                    csvImportStatus.textContent = `Could not import this CSV: ${error.message}`;
                } finally {
                    csvInput.value = '';
                }
            };
            reader.onerror = function () {
                csvImportStatus.textContent = 'Could not read this file. Try exporting it as UTF-8 CSV.';
                csvInput.value = '';
            };
            reader.readAsText(file);
        });
    }

    document.querySelector('#exportExpensesBtn').addEventListener('click', function () {
        const headers = ['Date', 'Description', 'Category', 'Amount', 'Currency'];
        const csvCell = value => `"${String(value).replace(/"/g, '""')}"`;
        const rows = [headers, ...expenseList.map(expense => {
            const date = new Date(expense.date);
            const amount = ((Number(expense.amount) || 0) / ratesToNaira[currentCurrency]).toFixed(2);
            return [Number.isNaN(date.getTime()) ? '' : date.toISOString(), expense.description || '', expense.category || 'Other', amount, currentCurrency];
        })];
        const contents = `\uFEFF${rows.map(row => row.map(csvCell).join(',')).join('\r\n')}`;
        const blobUrl = URL.createObjectURL(new Blob([contents], { type: 'text/csv;charset=utf-8' }));
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = `spendguard-expenses-${localDateKey(new Date())}.csv`;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    });

    // ==========================================
    // 🧪 TEST AUTO SMS BUTTON
    // ==========================================
    const testSmsBtn = document.querySelector('#testSmsBtn');
    if (testSmsBtn) {
        testSmsBtn.addEventListener('click', function () {
            const testSmsExamples = [
                "Account Debit Alert: You spent ₦3,500 at McDonald's. Available balance: ₦50,000. Ref: 12345",
                "Transaction: Transfer of ₦2,500 sent to Uber. Status: Success. Reference: ABC123",
                "Notification: You have paid ₦2,000 for MTN Data Bundle. Thank you!",
                "Alert: Medical purchase ₦5,000 at Pharmacy Plus approved. Card ending 4567.",
                "Shopping Alert: ₦8,000 spent at Shoprite Mall. Merchant Code: 123456"
            ];
            
            const randomSms = testSmsExamples[Math.floor(Math.random() * testSmsExamples.length)];
            
            // Process the test SMS
            processIncomingSMS(randomSms);
            
            // Update status display
            const statusEl = document.querySelector('#autoSmsStatus');
            if (statusEl) {
                statusEl.innerHTML = `
                    <strong>✅ Example SMS parsed:</strong><br>
                    "${randomSms}"<br>
                    <small style="color: #7f8c8d; margin-top: 5px; display: block;">Check your expense table and chart!</small>
                `;
                setTimeout(() => {
                    statusEl.textContent = 'Ready for manual SMS parsing.';
                }, 5000);
            }
        });
        
        // Set initial status
        const statusEl = document.querySelector('#autoSmsStatus');
        if (statusEl) {
            statusEl.textContent = 'Ready for manual SMS parsing.';
        }
    }

    // Clear History
    const clearBtn = document.querySelector('#clearHistoryBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', function () {
            if (confirm("⚠️ Clear all expenses? This cannot be undone!")) {
                expenseList = [];
                persistExpenses();
                updateAllDisplays();
                alert("✅ Cleared!");
            }
        });
    }

    // Logout
    const logoutBtn = document.querySelector('#logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async function () {
            if (confirm("Logout?")) {
                const { error } = await supabaseClient.auth.signOut();
                if (error) {
                    alert('Could not log out. Please try again.');
                    return;
                }
                window.location.href = 'login.html';
            }
        });
    }

    // Sidebar navigation
    const navHome = document.querySelector('#navHomeBtn');
    const navChart = document.querySelector('#navChartBtn');
    const navSettings = document.querySelector('#navSettingsBtn');
    const homePage = document.querySelector('#homePage');
    const chartPage = document.querySelector('#chartPage');
    const accountPage = document.querySelector('#accountPage');
    const pageHeading = document.querySelector('#pageHeading');

    function showPage(page) {
        homePage.classList.toggle('hidden', page !== 'home');
        chartPage.classList.toggle('hidden', page !== 'charts');
        accountPage.classList.toggle('hidden', page !== 'settings');
        navHome.classList.toggle('active', page === 'home');
        navChart.classList.toggle('active', page === 'charts');
        navSettings.classList.toggle('active', page === 'settings');
        pageHeading.textContent = page === 'home' ? 'Your overview' : page === 'charts' ? 'Spending insights' : 'Account settings';
        if (page === 'charts') {
            expenseChart.resize();
            updateChart();
        }
    }

    navHome.addEventListener('click', () => showPage('home'));
    navChart.addEventListener('click', () => showPage('charts'));
    navSettings.addEventListener('click', () => showPage('settings'));

    const chartView = document.querySelector('#chartView');
    const chartGrouping = document.querySelector('#chartGrouping');
    [chartView, chartGrouping, document.querySelector('#chartStartDate'), document.querySelector('#chartEndDate')].forEach(control => {
        control.addEventListener('change', () => {
            chartGrouping.disabled = chartView.value !== 'period';
            updateChart();
        });
    });

    const spendyCommand = document.querySelector('#spendyCommand');
    const spendyResponse = document.querySelector('#spendyResponse');
    document.querySelector('#spendyLogBtn').addEventListener('click', () => handleSpendyCommand(spendyCommand.value));
    spendyCommand.addEventListener('keydown', event => {
        if (event.key === 'Enter') handleSpendyCommand(spendyCommand.value);
    });
    document.querySelector('#spendyReportBtn').addEventListener('click', () => {
        handleSpendyCommand('show spending report');
    });

    async function requestInlineAiAdvice(button, question) {
        const response = document.querySelector('#spendyResponse');
        button.disabled = true;
        response.textContent = 'Spendy is reviewing your monthly totals…';
        try {
            response.textContent = await requestAiAdvice(question);
        } catch (error) {
            response.textContent = error.message;
        } finally {
            button.disabled = false;
        }
    }

    document.querySelector('#spendyAiBtn').addEventListener('click', async function () {
        const question = document.querySelector('#spendyCommand').value.trim() || 'Review my monthly spending and suggest one practical way to stay within my budget.';
        await requestInlineAiAdvice(this, question);
    });
    document.querySelector('#spendyGreetingBtn').addEventListener('click', function () {
        const greeting = "Hi, I'm Spendy, nice to meet you!";
        spendyResponse.textContent = greeting;
        if (!speakSpendy(greeting)) {
            spendyResponse.textContent = `${greeting} Voice playback is not supported in this browser.`;
        }
    });

    document.querySelector('#spendyMicBtn').addEventListener('click', function () {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            spendyResponse.textContent = 'Voice input is not supported in this browser. Type your expense instead.';
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.lang = navigator.language || 'en-US';
        recognition.continuous = false;
        recognition.interimResults = false;
        spendyResponse.textContent = 'Listening. Say an item and amount, for example “Food 200 dollars.”';
        recognition.onresult = event => {
            const spokenCommand = event.results[0][0].transcript;
            spendyCommand.value = spokenCommand;
            handleSpendyCommand(spokenCommand, true);
        };
        recognition.onerror = event => {
            spendyResponse.textContent = event.error === 'not-allowed'
                ? 'Microphone permission was denied. You can type your expense instead.'
                : 'I could not hear that clearly. Try again or type the expense.';
        };
        recognition.onend = () => {
            if (spendyResponse.textContent.startsWith('Listening.')) {
                spendyResponse.textContent = 'No speech was detected. Try again or type the expense.';
            }
        };
        recognition.start();
    });

    const spendyChatToggle = document.querySelector('#spendyChatToggle');
    const spendyChatPanel = document.querySelector('#spendyChatPanel');
    const spendyChatInput = document.querySelector('#spendyChatInput');
    const spendyChatMessages = document.querySelector('#spendyChatMessages');
    let longPressTimer = null;
    let longPressOpenedChat = false;

    function openSpendyChat() {
        spendyChatPanel.classList.remove('hidden');
        spendyChatPanel.setAttribute('aria-hidden', 'false');
        spendyChatToggle.setAttribute('aria-expanded', 'true');
        spendyChatInput.focus();
    }

    function closeSpendyChat() {
        spendyChatPanel.classList.add('hidden');
        spendyChatPanel.setAttribute('aria-hidden', 'true');
        spendyChatToggle.setAttribute('aria-expanded', 'false');
        if (!spendyChatToggle.classList.contains('hidden')) spendyChatToggle.focus();
        else spendyCommand.focus();
    }

    function addSpendyChatMessage(text, sender) {
        const message = document.createElement('div');
        message.className = `spendy-chat-message ${sender}`;
        message.textContent = text;
        spendyChatMessages.appendChild(message);
        spendyChatMessages.scrollTop = spendyChatMessages.scrollHeight;
    }

    function sendSpendyChatMessage(text, speakResponse = false) {
        const message = text.trim();
        if (!message) return;

        addSpendyChatMessage(message, 'user');
        spendyChatInput.value = '';
        handleSpendyCommand(message, speakResponse);
        addSpendyChatMessage(document.querySelector('#spendyResponse').textContent, 'assistant');
    }

    async function askAiFromChat() {
        const question = spendyChatInput.value.trim() || 'Review my monthly spending and give one practical budget suggestion.';
        addSpendyChatMessage(question, 'user');
        spendyChatInput.value = '';
        const pendingMessage = document.createElement('div');
        pendingMessage.className = 'spendy-chat-message assistant';
        pendingMessage.textContent = 'Spendy is reviewing your totals…';
        spendyChatMessages.appendChild(pendingMessage);
        spendyChatMessages.scrollTop = spendyChatMessages.scrollHeight;

        const aiButton = document.querySelector('#spendyChatAi');
        aiButton.disabled = true;
        try {
            pendingMessage.textContent = await requestAiAdvice(question);
        } catch (error) {
            pendingMessage.textContent = error.message;
            if (!spendyChatPanel.classList.contains('hidden')) {
                document.querySelector('#spendyResponse').textContent = error.message;
            }
        } finally {
            aiButton.disabled = false;
            spendyChatMessages.scrollTop = spendyChatMessages.scrollHeight;
        }
    }

    spendyChatToggle.addEventListener('click', function () {
        if (longPressOpenedChat) {
            longPressOpenedChat = false;
            return;
        }
        openSpendyChat();
    });
    spendyChatToggle.addEventListener('pointerdown', function () {
        window.clearTimeout(longPressTimer);
        longPressTimer = window.setTimeout(function () {
            longPressOpenedChat = true;
            openSpendyChat();
        }, 600);
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(eventName => {
        spendyChatToggle.addEventListener(eventName, () => window.clearTimeout(longPressTimer));
    });
    document.querySelector('#spendyChatClose').addEventListener('click', closeSpendyChat);
    document.querySelector('#spendyChatForm').addEventListener('submit', function (event) {
        event.preventDefault();
        sendSpendyChatMessage(spendyChatInput.value);
    });
    document.querySelector('#spendyChatAi').addEventListener('click', askAiFromChat);
    document.querySelector('#spendyChatMic').addEventListener('click', function () {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            addSpendyChatMessage('Voice input is not supported in this browser. Type your message instead.', 'assistant');
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.lang = navigator.language || 'en-US';
        recognition.continuous = false;
        recognition.interimResults = false;
        addSpendyChatMessage('Listening. Say an expense or ask for your monthly report.', 'assistant');
        recognition.onresult = event => sendSpendyChatMessage(event.results[0][0].transcript, true);
        recognition.onerror = event => addSpendyChatMessage(
            event.error === 'not-allowed' ? 'Microphone permission was denied. Type your message instead.' : 'I could not hear that clearly. Please try again.',
            'assistant'
        );
        recognition.start();
    });

    settingsCountry.addEventListener('change', function () {
        const region = regions.find(item => item.code === this.value);
        document.querySelector('#settingsCurrencyLabel').textContent = region
            ? `Currency: ${region.currency}. Exchange rates are estimates and are not live market quotes.`
            : '';
    });

    document.querySelector('#saveProfileBtn').addEventListener('click', async function () {
        const username = document.querySelector('#settingsUsername').value.trim();
        const region = regions.find(item => item.code === settingsCountry.value);
        if (!username || !region) {
            alert('Enter a display name and choose a valid location.');
            return;
        }

        const { data, error } = await supabaseClient.auth.updateUser({
            data: { username, country: region.code, currency: region.currency }
        });
        if (error) {
            alert(`Profile could not be saved: ${error.message}`);
            return;
        }

        currentUser = data.user;
        currentCountry = region.code;
        currentCurrency = region.currency;
        document.querySelector('#settingsCurrencyLabel').textContent = `Currency: ${currentCurrency}. Exchange rates are estimates and are not live market quotes.`;
        document.querySelector('#fromCurrency').value = currentCurrency;
        document.querySelector('#toCurrency').value = currentCurrency;
        renderAccountSummary();
        updateAllDisplays();
        updateChart();
        if (accountLabel) accountLabel.textContent = `Profile saved for ${username}. Amounts are now shown in ${currentCurrency}.`;
    });

    document.querySelector('#changePasswordBtn').addEventListener('click', async function () {
        const oldPassword = document.querySelector('#currentPassword').value;
        const newPassword = document.querySelector('#newPassword').value;
        const status = document.querySelector('#passwordStatus');
        if (!oldPassword || newPassword.length < 8) {
            status.textContent = 'Enter your current password and a new password with at least 8 characters.';
            return;
        }

        status.textContent = 'Verifying your current password...';
        const verification = await supabaseClient.auth.signInWithPassword({ email: currentUser.email, password: oldPassword });
        if (verification.error) {
            status.textContent = 'Current password was not accepted.';
            return;
        }

        const result = await supabaseClient.auth.updateUser({ password: newPassword });
        if (result.error) {
            status.textContent = `Password could not be changed: ${result.error.message}`;
            return;
        }

        currentUser = result.data.user;
        document.querySelector('#currentPassword').value = '';
        document.querySelector('#newPassword').value = '';
        status.textContent = 'Password updated successfully.';
    });

    const autoLockEnabled = document.querySelector('#autoLockEnabled');
    const autoLockMinutes = document.querySelector('#autoLockMinutes');
    const autoLockKey = 'spendGuardAutoLock';
    let savedLockSettings = {};
    try {
        savedLockSettings = JSON.parse(localStorage.getItem(autoLockKey) || '{}');
    } catch (error) {
        savedLockSettings = {};
    }
    autoLockEnabled.checked = savedLockSettings.enabled === true;
    autoLockMinutes.value = String(savedLockSettings.minutes || 5);

    const lockOverlay = document.querySelector('#lockOverlay');
    let lockTimer = null;

    function lockApp() {
        window.clearTimeout(lockTimer);
        lockOverlay.classList.remove('hidden');
        document.querySelector('#unlockPassword').value = '';
        document.querySelector('#unlockError').textContent = '';
        document.querySelector('#unlockPassword').focus();
    }

    function resetLockTimer() {
        window.clearTimeout(lockTimer);
        if (autoLockEnabled.checked && lockOverlay.classList.contains('hidden')) {
            lockTimer = window.setTimeout(lockApp, Number(autoLockMinutes.value) * 60 * 1000);
        }
    }

    document.querySelector('#lockNowBtn').addEventListener('click', lockApp);
    document.querySelector('#saveLockSettingsBtn').addEventListener('click', function () {
        localStorage.setItem(autoLockKey, JSON.stringify({
            enabled: autoLockEnabled.checked,
            minutes: Number(autoLockMinutes.value)
        }));
        resetLockTimer();
        if (accountLabel) accountLabel.textContent = autoLockEnabled.checked
            ? `Automatic lock enabled after ${autoLockMinutes.value} minutes of inactivity.`
            : 'Automatic lock disabled.';
    });

    document.querySelector('#unlockForm').addEventListener('submit', async function (event) {
        event.preventDefault();
        const password = document.querySelector('#unlockPassword').value;
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email: currentUser.email, password });
        if (error) {
            document.querySelector('#unlockError').textContent = 'Password was not accepted. Try again.';
            document.querySelector('#unlockPassword').select();
            return;
        }

        currentUser = data.user;
        lockOverlay.classList.add('hidden');
        resetLockTimer();
    });

    document.querySelector('#unlockLogoutBtn').addEventListener('click', async function () {
        await supabaseClient.auth.signOut();
        window.location.href = 'login.html';
    });

    ['pointerdown', 'keydown', 'touchstart'].forEach(eventName => {
        window.addEventListener(eventName, resetLockTimer, { passive: true });
    });
    resetLockTimer();
    if (autoLockEnabled.checked) lockApp();

    // Cloud Sync
    const saveCloudBtn = document.querySelector('#saveCloudUrlBtn');
    if (saveCloudBtn) {
        saveCloudBtn.addEventListener('click', function () {
            const url = document.querySelector('#cloudUrlInput').value.trim();
            if (url) {
                localStorage.setItem('myPrivateCloudURL', url);
                alert("✅ Cloud URL saved!");
                document.querySelector('#cloudUrlInput').value = "";
            }
        });
    }

    const syncCloudBtn = document.querySelector('#syncToCloudBtn');
    if (syncCloudBtn) {
        syncCloudBtn.addEventListener('click', function () {
            const cloudUrl = localStorage.getItem('myPrivateCloudURL');
            if (!cloudUrl) {
                alert("❌ Set cloud URL first!");
                return;
            }

            fetch(cloudUrl, {
                method: "POST",
                body: JSON.stringify({ expenses: expenseList, timestamp: new Date().toISOString() }),
                headers: { "Content-Type": "application/json" }
            }).then(() => alert("✅ Synced!")).catch(() => alert("❌ Sync failed!"));
        });
    }

    const loadCloudBtn = document.querySelector('#loadFromCloudBtn');
    if (loadCloudBtn) {
        loadCloudBtn.addEventListener('click', function () {
            const cloudUrl = localStorage.getItem('myPrivateCloudURL');
            if (!cloudUrl) {
                alert("❌ Set cloud URL first!");
                return;
            }

            fetch(cloudUrl + "?action=GET")
                .then(r => r.json())
                .then(data => {
                    if (data.expenses) {
                        expenseList = [...expenseList, ...data.expenses];
                        persistExpenses();
                        updateAllDisplays();
                        alert(`✅ Loaded ${data.expenses.length} expenses!`);
                    }
                })
                .catch(() => alert("❌ Load failed!"));
        });
    }
};
