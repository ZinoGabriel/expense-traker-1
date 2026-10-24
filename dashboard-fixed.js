window.onload = function () {
    // ✅ LOGIN CHECK
    if (localStorage.getItem('isLoggedIn') !== 'true') {
        window.location.href = 'login.html';
    }

    // ==========================================
    // 🎯 DATA ENGINE
    // ==========================================
    let expenseList = JSON.parse(localStorage.getItem('mySavedExpenses')) || [];
    let totalAccumulatedSpent = 0;

    const BASE_NAIRA_RATES = {
        "USD": 1346.50,
        "GBP": 1838.75,
        "EUR": 1573.00,
        "NGN": 1.00
    };

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

    function saveExpense(desc, cat, amount) {
        const expense = {
            description: desc,
            category: cat,
            amount: parseFloat(amount),
            date: new Date().toISOString()
        };
        expenseList.push(expense);
        localStorage.setItem('mySavedExpenses', JSON.stringify(expenseList));
        updateAllDisplays();
    }

    function updateAllDisplays() {
        console.log("📊 Updating all displays...");
        renderTable();
        updateBudgetCards();
        renderCategoryLimits();
        updateChart();
    }

    function renderTable() {
        const table = document.querySelector('#expenseTableBody');
        if (!table) return;

        table.innerHTML = "<tr style='font-weight:bold; background:#f0f0f0;'><td>Description</td><td>Category</td><td>Amount</td></tr>";

        expenseList.forEach(exp => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${exp.description || "Expense"}</td>
                <td><strong>${exp.category || "Other"}</strong></td>
                <td>₦${(parseFloat(exp.amount) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            `;
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

        if (weekEl) weekEl.innerText = `₦${totalWeek.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        if (monthEl) monthEl.innerText = `₦${totalMonth.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        if (yearEl) yearEl.innerText = `₦${totalYear.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

        // Budget limit
        const budgetLimit = parseFloat(localStorage.getItem('myBudgetLimit')) || 0;
        if (limitEl) {
            limitEl.innerText = `₦${budgetLimit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
        if (budgetEl) budgetEl.innerText = `₦${overBudget.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    function renderCategoryLimits() {
        const list = document.querySelector('#categoryLimitsList');
        if (!list) return;
        
        list.innerHTML = "";
        const limits = JSON.parse(localStorage.getItem('myCategoryLimits')) || {};
        
        for (let cat in limits) {
            const li = document.createElement('li');
            li.textContent = `${cat}: ₦${parseFloat(limits[cat]).toLocaleString()}`;
            list.appendChild(li);
        }
    }

    // ==========================================
    // 📊 CHART SETUP
    // ==========================================
    let expenseChart = null;

    function initializeChart() {
        const ctx = document.getElementById('expenseChart');
        if (!ctx) return;

        expenseChart = new Chart(ctx, {
            type: 'doughnut',
            data: { labels: [], datasets: [{ data: [], backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40'], borderColor: '#fff', borderWidth: 2 }] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { padding: 15, font: { size: 14 } } },
                    tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ₦${ctx.parsed.toLocaleString()} (${((ctx.parsed / ctx.dataset.data.reduce((a, b) => a + b, 0)) * 100).toFixed(1)}%)` } }
                }
            }
        });
    }

    function updateChart() {
        if (!expenseChart) return;

        let totals = {};
        expenseList.forEach(exp => {
            const cat = exp.category || "Other";
            totals[cat] = (totals[cat] || 0) + (parseFloat(exp.amount) || 0);
        });

        const categories = Object.keys(totals).length > 0 ? Object.keys(totals) : ['No Data'];
        const amounts = Object.keys(totals).length > 0 ? Object.values(totals) : [1];

        expenseChart.data.labels = categories;
        expenseChart.data.datasets[0].data = amounts;
        expenseChart.update();
    }

    // ==========================================
    // ⚙️ INITIALIZE
    // ==========================================
    initializeChart();
    updateAllDisplays();

    // ==========================================
    // 🎯 EVENT LISTENERS
    // ==========================================

    // Budget Limit
    const saveLimitBtn = document.querySelector('#saveLimitBtn');
    if (saveLimitBtn) {
        saveLimitBtn.addEventListener('click', function () {
            const limit = parseFloat(document.querySelector('#budgetLimitInput').value);
            if (limit > 0) {
                localStorage.setItem('myBudgetLimit', limit);
                alert(`✅ Budget set to ₦${limit.toLocaleString()}`);
                document.querySelector('#budgetLimitInput').value = "";
                updateBudgetCards();
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
                limits[catName] = catLimit;
                localStorage.setItem('myCategoryLimits', JSON.stringify(limits));
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

            document.querySelector('#convertOutput').innerText = `✅ ${amount} ${from} = ₦${converted.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

            if (to === "NGN") {
                const catInfo = detectCategoryAndDesc(desc);
                saveExpense(`${desc} (${amount} ${from})`, catInfo.category, converted);
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

            const match = sms.match(/₦?\s?([\d,]+(\.\d{1,2})?)/);
            const amount = match ? parseFloat(match[1].replace(/,/g, "")) : 0;
            const catInfo = detectCategoryAndDesc(sms);

            if (amount > 0) {
                saveExpense(catInfo.description, catInfo.category, amount);
                document.querySelector('#smsOutput').innerText = `✅ ${catInfo.description} - ₦${amount.toLocaleString()}`;
                document.querySelector('#smsInput').value = "";
            } else {
                document.querySelector('#smsOutput').innerText = "❌ No amount found!";
            }
        });
    }

    // CSV Import
    const csvInput = document.querySelector('#bankFileInput');
    if (csvInput) {
        csvInput.addEventListener('change', function (e) {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                const lines = event.target.result.split('\n');
                let count = 0;

                for (let i = 1; i < lines.length; i++) {
                    const parts = lines[i].trim().split(',');
                    if (parts.length >= 3) {
                        const desc = parts[0].trim();
                        const cat = parts[1].trim();
                        const amt = parseFloat(parts[2].trim());
                        if (desc && cat && !isNaN(amt) && amt > 0) {
                            saveExpense(desc, cat, amt);
                            count++;
                        }
                    }
                }

                alert(`✅ Imported ${count} expenses!`);
                csvInput.value = "";
            };
            reader.readAsText(file);
        });
    }

    // Clear History
    const clearBtn = document.querySelector('#clearHistoryBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', function () {
            if (confirm("⚠️ Clear all expenses? This cannot be undone!")) {
                expenseList = [];
                localStorage.removeItem('mySavedExpenses');
                updateAllDisplays();
                alert("✅ Cleared!");
            }
        });
    }

    // Logout
    const logoutBtn = document.querySelector('#logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function () {
            if (confirm("Logout?")) {
                localStorage.removeItem('isLoggedIn');
                window.location.href = 'login.html';
            }
        });
    }

    // Navigation
    const navHome = document.querySelector('#navHomeBtn');
    const navChart = document.querySelector('#navChartBtn');
    const homePage = document.querySelector('#homePage');
    const chartPage = document.querySelector('#chartPage');

    if (navHome && navChart && homePage && chartPage) {
        navHome.addEventListener('click', () => {
            homePage.classList.remove('hidden');
            chartPage.classList.add('hidden');
            navHome.classList.add('active');
            navChart.classList.remove('active');
        });

        navChart.addEventListener('click', () => {
            chartPage.classList.remove('hidden');
            homePage.classList.add('hidden');
            navChart.classList.add('active');
            navHome.classList.remove('active');
            updateChart();
        });
    }

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
                        localStorage.setItem('mySavedExpenses', JSON.stringify(expenseList));
                        updateAllDisplays();
                        alert(`✅ Loaded ${data.expenses.length} expenses!`);
                    }
                })
                .catch(() => alert("❌ Load failed!"));
        });
    }
};
