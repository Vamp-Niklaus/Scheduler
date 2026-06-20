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

    // Handle Form Submit (Mock for now)
    addTaskForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        // Hide modal
        addModal.classList.add('hidden');
        addTaskForm.reset();
        
        // Show success toast
        showToast("New revision scheduled!");
        
        // Mock showing the new task
        setTimeout(() => {
            fetchCurrentTask();
        }, 1000);
    });

    // Handle Mark Done
    markDoneBtn.addEventListener('click', () => {
        // Show loading state
        activeTaskCard.classList.add('hidden');
        loadingState.classList.remove('hidden');
        
        // Simulate API call to backend for 1.5 seconds
        setTimeout(() => {
            showToast("Revision complete! Rescheduled.");
            
            // Fire local notification if permission granted
            if ("Notification" in window && Notification.permission === "granted") {
                new Notification("Revision Complete!", {
                    body: "Task has been successfully rescheduled based on spaced repetition."
                });
            }

            // Show empty state (assuming no more tasks for today)
            loadingState.classList.add('hidden');
            emptyState.classList.remove('hidden');
        }, 1500);
    });

    function showToast(msg) {
        toastMessage.textContent = msg;
        toast.classList.remove('hidden');
        
        setTimeout(() => {
            toast.classList.add('hidden');
        }, 3000);
    }

    // Mock initial fetch
    function fetchCurrentTask() {
        // In the real app, this will fetch from FastAPI / MongoDB
        loadingState.classList.remove('hidden');
        activeTaskCard.classList.add('hidden');
        emptyState.classList.add('hidden');

        setTimeout(() => {
            loadingState.classList.add('hidden');
            activeTaskCard.classList.remove('hidden');
        }, 800);
    }

    // Initialize
    fetchCurrentTask();
});
