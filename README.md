# Ultimate Stopwatch

A powerful, mobile-first web application for advanced time tracking, lap recording, session management, and productivity calculations.

## Features

### Core Stopwatch Functionality
- **Start/Stop/Pause/Resume**: Full control over timing with visual feedback
- **Unlimited Laps**: Record unlimited lap times with individual and cumulative displays
- **Real-time Display**: High-precision time display with millisecond accuracy
- **Keyboard Shortcuts**: 
  - `Enter` - Start/Pause/Resume stopwatch
  - `Space` - Record lap (Next)

### Session Management
- **Folder Organization**: Create folders to organize your timing sessions
- **Save Results**: Save completed sessions with custom names
- **Image Attachments**: Attach reference images to results (stored as Base64 in localStorage)
- **Persistent Storage**: All data stored locally in browser using localStorage

### Analysis & Statistics
- **Average Lap Time**: Automatic calculation of average lap times
- **Total Time Tracking**: View cumulative time for all laps
- **Detailed Lap History**: Review all individual lap times and cumulative times

### Calculation Tools
Three powerful calculation modes based on your average lap time:

1. **Quantity Mode**: Calculate total time needed for a specific quantity
2. **Time Mode**: Calculate how many items can be completed in a given duration
3. **Price Per Piece Mode**: Calculate cost per item based on hourly wage
   - Wage is saved with the result for future reference

### Themes
- **Light Theme**: Clean, bright interface for daytime use
- **Dark Theme**: Eye-friendly dark mode for low-light environments
- Theme preference is saved and persists across sessions

## Mobile Optimization

The app is designed with mobile-first principles:
- **Touch-Optimized**: Large, easy-to-tap buttons with visual feedback
- **Responsive Layout**: Adapts beautifully from phone to tablet to desktop
- **Vertical Display Priority**: Optimized for portrait orientation
- **Safe Area Support**: Respects iPhone notches and Android navigation bars
- **PWA-Ready**: Can be added to home screen on iOS and Android

## Usage

### Getting Started
1. Open `index.html` in any modern web browser
2. Create a folder to organize your sessions
3. Start the stopwatch and begin timing

### Recording a Session
1. Click the stopwatch FAB (floating action button) or press `Enter`
2. Press `Space` or click "Next" to record laps
3. Click "Stop" when finished
4. Save the result with a name, folder, and optional image

### Viewing Results
1. Navigate to a folder from the home screen
2. Click on any result to view details
3. Use the "Calculate" button for productivity analysis

### Calculations
- **Quantity**: Enter number of items to estimate total time
- **Time**: Enter duration in HH:MM:SS format to estimate quantity
- **Price**: Enter hourly wage to calculate cost per item

## Technical Details

### Data Storage
All data is stored in browser localStorage:
- `as_folders` - Folder list
- `as_results` - Results with laps and metadata
- `as_theme` - Theme preference

### Browser Compatibility
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+
- Mobile browsers (iOS Safari, Chrome Mobile, Samsung Internet)

### File Structure
```
UltimateStopwatch/
├── index.html          # Main HTML structure
├── styles.css          # Comprehensive styling with themes
├── app.js              # Complete application logic
└── README.md           # Documentation
```

## Features Implementation

### State Management
Centralized `AppState` object manages:
- Current view (home/stopwatch/folder/result)
- Stopwatch state (running, paused, elapsed time, laps)
- Theme preference
- Navigation context

### Data Management
`DataManager` module handles:
- CRUD operations for folders and results
- LocalStorage persistence
- Data relationships between folders and results

### Stopwatch Engine
High-precision timing using:
- `Date.now()` for accurate time tracking
- 10ms interval for smooth display updates
- Pause/resume with elapsed time preservation

### UI Rendering
Dynamic rendering system:
- Single-page application architecture
- Efficient DOM updates
- Event delegation for performance

## Additional Features Added

Beyond the original specification, the following enhancements were included:

1. **Empty States**: Helpful messaging when no folders or results exist
2. **Confirmation Dialogs**: Prevent accidental deletion of folders/results
3. **Visual Feedback**: Active states on all interactive elements
4. **Smooth Animations**: Touch feedback and transitions
5. **Average Display**: Live average lap time during stopwatch operation
6. **Flexible Folder Creation**: Create folders from home screen or during save
7. **Image Preview**: Preview attached images before saving

## Performance

- **Lightweight**: Pure vanilla JavaScript, no frameworks (~30KB total)
- **Fast**: Instant load times, no build process required
- **Efficient**: Minimal DOM manipulation, optimized rendering
- **Reliable**: Works offline, no external dependencies

## Tips

- Use folders to separate different types of activities (e.g., "Work", "Exercise", "Crafts")
- Attach images to results for visual reference (e.g., product photos, workout screenshots)
- Use the price calculator to estimate project costs based on time
- Dark theme reduces battery usage on OLED screens
- Add to home screen on mobile for app-like experience

## License

Free to use and modify for personal and commercial projects.

---

**Enjoy tracking your time with Ultimate Stopwatch!**
