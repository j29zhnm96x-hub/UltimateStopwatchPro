// Include Sortable.js library
import Sortable from 'sortablejs';

function initSortable() {
    // Initialize Sortable for results
    const resultsList = document.querySelector('.results-list');
    if (resultsList) {
        new Sortable(resultsList, {
            animation: 150,
            onEnd: (evt) => {
                const ids = Array.from(resultsList.children).map(el => el.dataset.resultId);
                DataManager.setResultsOrder(AppState.currentFolder, ids);
                renderFolderView(AppState.currentFolder);
            }
        });
    }

    // Initialize Sortable for folders
    const foldersGrid = document.querySelector('.folders-grid');
    if (foldersGrid) {
        new Sortable(foldersGrid, {
            animation: 150,
            onEnd: (evt) => {
                const ids = Array.from(foldersGrid.children).map(el => el.dataset.folderId);
                DataManager.setFoldersOrder(ids);
                renderHome();
            }
        });
    }
}

export { initSortable };
