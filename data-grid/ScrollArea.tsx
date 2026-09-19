import React from 'react';
import type { TableContainerProps } from '@mui/material';
import { styled } from '@mui/material/styles';
import { TableContainer } from '@mui/material';

/**
 * Scroll region for a result table.
 *
 * A wide result set needs a horizontal scrollbar the user can actually find.
 * macOS overlay scrollbars are hidden until you scroll, which makes a table
 * look unscrollable; these rules give the track and thumb explicit, always
 * visible geometry in WebKit/Blink, plus `scrollbar-color`/`scrollbar-width`
 * for Firefox.
 *
 * The region is rendered focusable (`tabIndex={0}`) and labelled by the caller
 * so the table can be panned with the keyboard instead of a drag.
 */
const ScrollArea = styled(TableContainer)(({ theme }) => ({
  maxHeight: 460,
  overflow: 'auto',
  scrollbarWidth: 'thin',
  scrollbarColor: `${theme.palette.text.disabled} ${theme.palette.action.hover}`,
  '&::-webkit-scrollbar': {
    width: 12,
    height: 12,
  },
  '&::-webkit-scrollbar-track': {
    backgroundColor: theme.palette.action.hover,
    borderRadius: 6,
  },
  '&::-webkit-scrollbar-thumb': {
    backgroundColor: theme.palette.text.disabled,
    borderRadius: 6,
    border: `3px solid ${theme.palette.background.paper}`,
  },
  '&::-webkit-scrollbar-thumb:hover': {
    backgroundColor: theme.palette.text.secondary,
  },
  '&:focus-visible': {
    outline: `2px solid ${theme.palette.primary.main}`,
    outlineOffset: -2,
  },
})) as unknown as React.ComponentType<
  TableContainerProps & { tabIndex?: number; 'aria-label'?: string; role?: string }
>;

export default ScrollArea;
