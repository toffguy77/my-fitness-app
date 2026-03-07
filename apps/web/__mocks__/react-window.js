/**
 * Mock for react-window library
 * Used in tests to avoid issues with virtual scrolling
 */

import React from 'react';

// Mock List component
export function List({ rowComponent: RowComponent, rowCount, rowHeight, rowProps, children, listRef, defaultHeight, ...rest }) {
    // Render all rows for testing (no virtualization in tests)
    const rows = [];
    for (let index = 0; index < rowCount; index++) {
        const style = {
            position: 'absolute',
            top: index * (typeof rowHeight === 'number' ? rowHeight : 100),
            height: typeof rowHeight === 'number' ? rowHeight : 100,
            width: '100%',
        };
        rows.push(
            React.createElement(RowComponent, {
                key: index,
                index,
                style,
                ...(rowProps || {}),
            })
        );
    }

    return React.createElement(
        'div',
        {
            'data-testid': 'react-window-list',
            style: { position: 'relative', height: defaultHeight || 600, overflow: 'auto' },
            ...rest,
        },
        rows,
        children
    );
}

// Export default for compatibility
export default { List };
