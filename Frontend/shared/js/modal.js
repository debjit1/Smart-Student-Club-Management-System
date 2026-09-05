// Generic modal open/close — shared by President, Faculty Coordinator, and
// Club Head dashboards (each previously had its own byte-identical copy).
function openModal(modalId) {
    document.getElementById(modalId).classList.add("active");
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove("active");
}
