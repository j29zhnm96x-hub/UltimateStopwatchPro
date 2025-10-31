# Instructed Documentation

This document details the functionality of the Advanced Stopwatch application.

## Core Functionality

The application is an advanced stopwatch with features for timing, lap recording, session management, and performance calculation. All data is stored locally in the user's browser using `localStorage`.

### 1. Stopwatch

- **Start/Stop:** The user can start and stop the stopwatch. The `Enter` key also serves as a shortcut for this action.
- **Pause/Resume:** The stopwatch can be paused and resumed at any time.
- **Laps:** The user can record an unlimited number of laps by clicking the 'NEXT' button or by pressing the `Spacebar` key. Each lap's duration and the cumulative time are displayed.
- **Reset:** The stopwatch can be reset to its initial state.

### 2. Session and Data Management

- **Saving Sessions:** After stopping a stopwatch that has recorded laps, a dialog appears prompting the user to save the session as a 'result'.
- **Session Naming:** Each result can be given a custom name.
- **Image Attachment:** An image file can be attached to each result. The image is converted to a Data URL (Base64) and stored with the result data.
- **Folder Organization:**
    - Results can be saved into folders for better organization.
    - Users can create new folders from the home screen or directly from the save dialog.
    - The home screen displays a grid of all created folders, with a preview of the most recent results inside each.
- **Data Persistence:** All folders and results are stored in the browser's `localStorage`, making them persistent across browser sessions. The data is stored under the keys `as_folders` and `as_results`.
- **Deleting Data:**
    - Individual results can be deleted from within their folder view.
    - Entire folders can be deleted from the home screen. This action also deletes all results contained within that folder. A confirmation prompt is shown before deletion.

### 3. Results and Analysis

- **Viewing Results:** Users can navigate into folders to see a list of all saved results. Clicking on a result opens a detailed view.
- **Detailed View:** The result view displays:
    - The result's name and attached image.
    - Key statistics: Total Time, Average Lap Time, and the total number of laps.
    - A complete list of all recorded laps with their individual and cumulative times.

### 4. Calculation Feature

From the result view, a 'CALCULATE' button opens a modal with three calculation modes based on the average lap time for that session:

- **Quantity Mode:** Estimates the total time required to complete a specified quantity of items.
- **Time Mode:** Estimates the quantity of items that can be completed within a specified duration (in HH:MM:SS format).
- **Price per Piece Mode:**
    - Calculates the cost per piece based on a provided hourly wage.
    - The hourly wage entered by the user is saved and associated with that specific result for future reference.

## Additional Features

- **Theme Switching:** The application includes a light and a dark theme. The user can toggle between them using a settings button in the header. The theme preference is saved in `localStorage` under the key `as_theme`.
