const API_URL = "https://scheduler-5y9n.onrender.com";
let currentTaskId = null;
let currentUser = localStorage.getItem("username");
let currentName = localStorage.getItem("name");

let isLoginMode = true;

document.addEventListener('DOMContentLoaded', () => {
    // Auth UI Elements
    const authView = document.getElementById('auth-view');
    const authForm = document.getElementById('auth-form');
    const nameGroup = document.getElementById('name-group');
    const authTitle = document.getElementById('auth-title');
    const authSubtitle = document.getElementById('auth-subtitle');
    const authSubmitBtn = document.getElementById('auth-submit-btn');
    const authSwitchLink = document.getElementById('auth-switch-link');
    const authSwitchText = document.getElementById('auth-switch-text');
    
    // Main UI Elements
    const mainHeader = document.getElementById('main-header');
    const dashboardView = document.getElementById('dashboard-view');
    const welcomeName = document.getElementById('welcome-name');
    const logoutBtn = document.getElementById('logout-btn');

    // Task Elements
    const dateElement = document.getElementById('current-date');
    const addBtn = document.getElementById('add-btn');
    const addModal = document.getElementById('add-modal');
    const closeBtn = document.getElementById('close-modal-btn');
    const addTaskForm = document.getElementById('add-task-form');
    
    const activeTaskCard = document.getElementById('active-task-card');
    const emptyState = document.getElementById('empty-state');
    const loadingState = document.getElementById('loading-state');
    const markDoneBtn = document.getElementById('mark-done-btn');
    
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toast-message');

    // --- Initialization ---
    const options = { weekday: 'long', month: 'short', day: 'numeric' };
    dateElement.textContent = new Date().toLocaleDateString('en-US', options);

    if ("Notification" in window) {
        if (Notification.permission !== "granted" && Notification.permission !== "denied") {
            Notification.requestPermission();
        }
    }

    checkAuth();

    function checkAuth() {
        if (currentUser) {
            authView.classList.add('hidden');
            mainHeader.classList.remove('hidden');
            dashboardView.classList.remove('hidden');
            welcomeName.textContent = currentName ? `(${currentName})` : "";
            fetchCurrentTask();
        } else {
            authView.classList.remove('hidden');
            mainHeader.classList.add('hidden');
            dashboardView.classList.add('hidden');
        }
    }

    // --- Auth Logic ---
    authSwitchLink.addEventListener('click', (e) => {
        e.preventDefault();
        isLoginMode = !isLoginMode;
        if (isLoginMode) {
            authTitle.textContent = "Welcome Back";
            authSubtitle.textContent = "Login to your scheduler";
            authSubmitBtn.textContent = "Login";
            nameGroup.classList.add('hidden');
            authSwitchText.textContent = "Don't have an account?";
            authSwitchLink.textContent = "Register";
            document.getElementById('auth-name').removeAttribute('required');
        } else {
            authTitle.textContent = "Create Account";
            authSubtitle.textContent = "Start tracking your revisions";
            authSubmitBtn.textContent = "Register";
            nameGroup.classList.remove('hidden');
            authSwitchText.textContent = "Already have an account?";
            authSwitchLink.textContent = "Login";
            document.getElementById('auth-name').setAttribute('required', 'true');
        }
    });

    authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('auth-username').value;
        const password = document.getElementById('auth-password').value;
        const name = document.getElementById('auth-name').value;

        const endpoint = isLoginMode ? "/login" : "/register";
        const bodyData = isLoginMode ? { username, password } : { name, username, password };

        authSubmitBtn.textContent = "Please wait...";
        authSubmitBtn.disabled = true;

        try {
            const res = await fetch(`${API_URL}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bodyData)
            });

            if (res.ok) {
                const data = await res.json();
                localStorage.setItem("username", data.username);
                localStorage.setItem("name", data.name);
                currentUser = data.username;
                currentName = data.name;
                
                authForm.reset();
                checkAuth();
                showToast("Logged in successfully!");
            } else {
                const errorData = await res.json();
                showToast(errorData.detail || "Authentication failed", true);
            }
        } catch (error) {
            console.error(error);
            showToast("Network error", true);
        } finally {
            authSubmitBtn.textContent = isLoginMode ? "Login" : "Register";
            authSubmitBtn.disabled = false;
        }
    });

    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem("username");
        localStorage.removeItem("name");
        currentUser = null;
        currentName = null;
        checkAuth();
    });

    // --- Task Logic ---
    addBtn.addEventListener('click', () => {
        addModal.classList.remove('hidden');
    });

    closeBtn.addEventListener('click', () => {
        addModal.classList.add('hidden');
    });

    addTaskForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentUser) return;
        
        const title = document.getElementById('new-title').value;
        const contentType = document.getElementById('new-type').value;
        const content = document.getElementById('new-content').value;

        addModal.classList.add('hidden');
        addTaskForm.reset();
        
        try {
            const res = await fetch(`${API_URL}/tasks`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-username': currentUser 
                },
                body: JSON.stringify({
                    title: title,
                    content_type: contentType,
                    content: content
                })
            });

            if (res.ok) {
                showToast("New revision scheduled!");
                fetchCurrentTask();
            } else {
                showToast("Failed to schedule task.", true);
            }
        } catch (error) {
            console.error(error);
            showToast("Network error.", true);
        }
    });

    markDoneBtn.addEventListener('click', async () => {
        if (!currentTaskId || !currentUser) return;

        activeTaskCard.classList.add('hidden');
        loadingState.classList.remove('hidden');
        
        try {
            const res = await fetch(`${API_URL}/tasks/${currentTaskId}/done`, {
                method: 'POST',
                headers: { 'x-username': currentUser }
            });

            if (res.ok) {
                showToast("Revision complete! Rescheduled.");
                
                if ("Notification" in window && Notification.permission === "granted") {
                    new Notification("Revision Complete!", {
                        body: "Task has been successfully rescheduled based on spaced repetition."
                    });
                }
                fetchCurrentTask();
            } else {
                showToast("Failed to update task.", true);
                loadingState.classList.add('hidden');
                activeTaskCard.classList.remove('hidden');
            }
        } catch (error) {
            console.error(error);
            showToast("Network error.", true);
            loadingState.classList.add('hidden');
            activeTaskCard.classList.remove('hidden');
        }
    });

    function showToast(msg, isError = false) {
        toastMessage.textContent = msg;
        if (isError) {
            toast.classList.add('error');
            toast.querySelector('i').className = "fa-solid fa-circle-exclamation";
        } else {
            toast.classList.remove('error');
            toast.querySelector('i').className = "fa-solid fa-circle-check";
        }

        toast.classList.remove('hidden');
        
        setTimeout(() => {
            toast.classList.add('hidden');
        }, 3000);
    }

    async function fetchCurrentTask() {
        if (!currentUser) return;

        loadingState.classList.remove('hidden');
        activeTaskCard.classList.add('hidden');
        emptyState.classList.add('hidden');

        try {
            const res = await fetch(`${API_URL}/tasks/next`, {
                headers: { 'x-username': currentUser }
            });

            if (res.ok) {
                const task = await res.json();
                if (task && task.id) {
                    document.getElementById('task-title').textContent = task.title;
                    
                    let stageText = `Stage ${task.stage}`;
                    if (task.stage === 0) stageText = "New (Due in 3 Days)";
                    else if (task.stage === 1) stageText = "Stage 1 (Due in 7 Days)";
                    else if (task.stage === 2) stageText = "Stage 2 (Due in 21 Days)";
                    else stageText = `Stage ${task.stage} (Load Balanced)`;
                    
                    document.getElementById('task-stage-badge').textContent = stageText;
                    
                    const linkBtn = document.getElementById('task-link');
                    if (task.content_type === 'url') {
                        linkBtn.href = task.content;
                        linkBtn.innerHTML = `Open Material <i class="fa-solid fa-arrow-up-right-from-square"></i>`;
                        linkBtn.style.display = 'inline-flex';
                    } else if (task.content_type === 'text') {
                        linkBtn.href = '#';
                        linkBtn.onclick = () => alert("Notes: " + task.content);
                        linkBtn.innerHTML = `View Notes <i class="fa-solid fa-note-sticky"></i>`;
                        linkBtn.style.display = 'inline-flex';
                    } else {
                        linkBtn.style.display = 'none';
                    }
                    
                    currentTaskId = task.id;
                    loadingState.classList.add('hidden');
                    activeTaskCard.classList.remove('hidden');
                } else {
                    loadingState.classList.add('hidden');
                    emptyState.classList.remove('hidden');
                }
            } else {
                loadingState.classList.add('hidden');
                emptyState.classList.remove('hidden');
            }
        } catch (error) {
            console.error(error);
            loadingState.classList.add('hidden');
            emptyState.classList.remove('hidden');
        }
    }
});
