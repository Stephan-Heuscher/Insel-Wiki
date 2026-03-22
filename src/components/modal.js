/**
 * Custom Promise-based modal for getting user inputs.
 * Replaces the native and ugly `window.prompt()`.
 */

export function promptModal(title, placeholder = '', defaultValue = '') {
  return new Promise((resolve) => {
    // 1. Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    
    // 2. Create modal box
    const modal = document.createElement('div');
    modal.className = 'modal-box';
    
    // 3. Title
    const header = document.createElement('h3');
    header.className = 'modal-title';
    header.textContent = title;
    
    // 4. Input field
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'modal-input';
    input.placeholder = placeholder;
    input.value = defaultValue;
    
    // 5. Buttons container
    const actions = document.createElement('div');
    actions.className = 'modal-actions';
    
    // 6. Cancel button
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-secondary';
    cancelBtn.textContent = 'Abbrechen';
    
    // 7. Submit button
    const submitBtn = document.createElement('button');
    submitBtn.className = 'btn btn-primary';
    submitBtn.textContent = 'OK';
    
    // Assemble
    actions.appendChild(cancelBtn);
    actions.appendChild(submitBtn);
    modal.appendChild(header);
    modal.appendChild(input);
    modal.appendChild(actions);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    // Focus input immediately
    // Small timeout ensures it works after being appended to DOM
    setTimeout(() => {
      input.focus();
      input.select();
    }, 10);

    // Cleanup function
    const cleanup = () => {
      document.body.removeChild(overlay);
    };

    // Event listeners
    const submit = () => {
      cleanup();
      resolve(input.value.trim() || null); // Return null if empty
    };

    const cancel = () => {
      cleanup();
      resolve(null);
    };

    submitBtn.addEventListener('click', submit);
    cancelBtn.addEventListener('click', cancel);
    
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
      if (e.key === 'Escape') cancel();
    });

    // Close on click outside
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cancel();
    });
  });
}
