"use client";

import { createContext, useContext, ReactNode } from 'react';

type FormatNamesType = {
  [key: string]: string;
};

type FormatIconsType = {
  [key: string]: string;
};

interface FormatContextType {
  formatNames: FormatNamesType;
  formatIcons: FormatIconsType;
  getFormatName: (key: string) => string;
  getFormatIcon: (key: string) => string;
  getFormatsList: () => { id: string; name: string; icon: string }[];
}

const FormatContext = createContext<FormatContextType | undefined>(undefined);

const formatNames: FormatNamesType = {
  'swiss': 'Vòng Swiss',
  'group': 'Vòng bảng',
  'single_elimination': 'Đấu loại trực tiếp',
  'double_elimination': 'Nhánh thắng-thua',
};

const formatIcons: FormatIconsType = {
  'swiss': '🔄',
  'group': '📊',
  'single_elimination': '⚡',
  'double_elimination': '🔄',
};

export function FormatProvider({ children }: { children: ReactNode }) {
  const getFormatName = (key: string): string => {
    return formatNames[key] || key;
  };

  const getFormatIcon = (key: string): string => {
    return formatIcons[key] || '🎮';
  };

  const getFormatsList = () => {
    return Object.keys(formatNames).map(key => ({
      id: key,
      name: formatNames[key],
      icon: formatIcons[key],
    }));
  };

  return (
    <FormatContext.Provider value={{
      formatNames,
      formatIcons,
      getFormatName,
      getFormatIcon,
      getFormatsList,
    }}>
      {children}
    </FormatContext.Provider>
  );
}

export function useFormat() {
  const context = useContext(FormatContext);
  if (context === undefined) {
    throw new Error('useFormat must be used within a FormatProvider');
  }
  return context;
}