const API_URL = "https://scheduler-5y9n.onrender.com";
let currentTaskId = null;

document.addEventListener('DOMContentLoaded', () => {
    // UI Elements
    const dateElement = document.getElementById('current-date');
    const addBtn = document.getElementById('add-btn');
    const addModal = document.getElementById('add-modal');
    const closeBtn = document.getElementById('close-modal-btn');
    const addTaskForm = document.getElementById('add-task-form');
    
    const dashboardView = document.getElementById('dashboard-view');
    const activeTaskCard = document.getElementById('active-task-card');
    const emptyState = document.getElementById('empty-state');
    const loadingState = document.getElementById('loading-state');
    
    const markDoneBtn = document.getElementById('mark-done-btn');
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toast-message');

    // Set Date
    const options = { weekday: 'long', month: 'short', day: 'numeric' };
    dateElement.textContent = new Date().toLocaleDateString('en-US', options);

    // Request Notification Permission on load
    if ("Notification" in window) {
        if (Notification.permission !== "granted" && Notification.permission !== "denied") {
            Notification.requestPermission();
        }
    }

    // Modal Logic
    addBtn.addEventListener('click', () => {
        addModal.classList.remove('hidden');
    });

    closeBtn.addEventListener('click', () => {
        addModal.classList.add('hidden');
    });

    // Handle Form Submit
    addTaskForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const title = document.getElementById('new-title').value;
        const contentType = document.getElementById('new-type').value;
        const content = document.getElementById('new-content').value;

        // Hide modal and show loading
        addModal.classList.add('hidden');
        addTaskForm.reset();
        
        try {
            const res = await fetch(`${API_URL}/tasks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
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
                showToast("Failed to schedule task.");
            }
        } catch (error) {
            console.error(error);
            showToast("Network error.");
        }
    });

    // Handle Mark Done
    markDoneBtn.addEventListener('click', async () => {
        if (!currentTaskId) return;

        // Show loading state
        activeTaskCard.classList.add('hidden');
        loadingState.classList.remove('hidden');
        
        try {
            const res = await fetch(`${API_URL}/tasks/${currentTaskId}/done`, {
                method: 'POST'
            });

            if (res.ok) {
                showToast("Revision complete! Rescheduled.");
                
                // Fire local notification if permission granted
                if ("Notification" in window && Notification.permission === "granted") {
                    new Notification("Revision Complete!", {
                        body: "Task has been successfully rescheduled based on spaced repetition."
                    });
                }

                // Fetch next immediately
                fetchCurrentTask();
            } else {
                showToast("Failed to update task.");
                loadingState.classList.add('hidden');
                activeTaskCard.classList.remove('hidden');
            }
        } catch (error) {
            console.error(error);
            showToast("Network error.");
            loadingState.classList.add('hidden');
            activeTaskCard.classList.remove('hidden');
        }
    });

    function showToast(msg) {
        toastMessage.textContent = msg;
        toast.classList.remove('hidden');
        
        setTimeout(() => {
            toast.classList.add('hidden');
        }, 3000);
    }

    // Fetch the next due task
    async function fetchCurrentTask() {
        loadingState.classList.remove('hidden');
        activeTaskCard.classList.add('hidden');
        emptyState.classList.add('hidden');

        try {
            const res = await fetch(`${API_URL}/tasks/next`);
            if (res.ok) {
                const task = await res.json();
                if (task) {
                    document.getElementById('task-title').textContent = task.title;
                    
                    // Stage logic display
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
                    // task is null, nothing is due
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

    // Initialize
    fetchCurrentTask();
});
