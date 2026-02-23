import React, { useState, useRef, useCallback, useMemo } from 'react'
import { View, Text, Pressable, Animated, useWindowDimensions } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { usePathname, useLocalSearchParams } from 'expo-router'

import './global.css'
import { SessionScreen } from './components/SessionScreen'
import { SplitLayout } from './components/SplitLayout'
import { SessionsSidebar } from './components/SessionsSidebar'
import { ProjectsSidebar } from './components/ProjectsSidebar'
import { SettingsScreen } from './components/SettingsScreen'
import { useSession } from './hooks/useSession'
import { useSessionMessages } from './hooks/useSessionMessages'
import { useChanges } from './hooks/useChanges'
import { useSidebarSessions } from './hooks/useSidebarSessions'
import { useProjects } from './hooks/useProjects'
import { useMusicPlayer } from './hooks/useMusicPlayer'
import { useSettings } from './hooks/useSettings'
import { useLayout } from './hooks/useLayout'

const ANIMATION_DURATION = 280

export default function App() {
  const { isTabletLandscape, width: screenWidth } = useLayout()
  const sidebarWidth = screenWidth * 0.85

  const sessionId = 'session-1'
  const { data: session } = useSession(sessionId)
  const { data: messages } = useSessionMessages(sessionId)
  const { data: changes } = useChanges(sessionId)
  const [activeTab, setActiveTab] = useState<'session' | 'changes'>('session')

  // Settings (only used for phone layout; iPad handles settings in left panel)
  const [settingsVisible, setSettingsVisible] = useState(false)
  const settings = useSettings()

  // Left sidebar (sessions)
  const [leftSidebarVisible, setLeftSidebarVisible] = useState(false)
  const leftSlideAnim = useRef(new Animated.Value(-sidebarWidth)).current
  const leftBackdropAnim = useRef(new Animated.Value(0)).current
  const [sessionSearchQuery, setSessionSearchQuery] = useState('')
  const { data: sidebarSessions } = useSidebarSessions(sessionSearchQuery)

  // Right sidebar (projects)
  const [rightSidebarVisible, setRightSidebarVisible] = useState(false)
  const rightSlideAnim = useRef(new Animated.Value(sidebarWidth)).current
  const rightBackdropAnim = useRef(new Animated.Value(0)).current
  const [projectSearchQuery, setProjectSearchQuery] = useState('')
  const { data: projects } = useProjects()
  const musicPlayer = useMusicPlayer()

  const openLeftSidebar = useCallback(() => {
    setLeftSidebarVisible(true)
    Animated.parallel([
      Animated.timing(leftSlideAnim, {
        toValue: 0,
        duration: ANIMATION_DURATION,
        useNativeDriver: true,
      }),
      Animated.timing(leftBackdropAnim, {
        toValue: 1,
        duration: ANIMATION_DURATION,
        useNativeDriver: true,
      }),
    ]).start()
  }, [leftSlideAnim, leftBackdropAnim])

  const closeLeftSidebar = useCallback(() => {
    Animated.parallel([
      Animated.timing(leftSlideAnim, {
        toValue: -sidebarWidth,
        duration: ANIMATION_DURATION,
        useNativeDriver: true,
      }),
      Animated.timing(leftBackdropAnim, {
        toValue: 0,
        duration: ANIMATION_DURATION,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setLeftSidebarVisible(false)
    })
  }, [leftSlideAnim, leftBackdropAnim, sidebarWidth])

  const openRightSidebar = useCallback(() => {
    setRightSidebarVisible(true)
    Animated.parallel([
      Animated.timing(rightSlideAnim, {
        toValue: 0,
        duration: ANIMATION_DURATION,
        useNativeDriver: true,
      }),
      Animated.timing(rightBackdropAnim, {
        toValue: 1,
        duration: ANIMATION_DURATION,
        useNativeDriver: true,
      }),
    ]).start()
  }, [rightSlideAnim, rightBackdropAnim])

  const closeRightSidebar = useCallback(() => {
    Animated.parallel([
      Animated.timing(rightSlideAnim, {
        toValue: sidebarWidth,
        duration: ANIMATION_DURATION,
        useNativeDriver: true,
      }),
      Animated.timing(rightBackdropAnim, {
        toValue: 0,
        duration: ANIMATION_DURATION,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setRightSidebarVisible(false)
    })
  }, [rightSlideAnim, rightBackdropAnim, sidebarWidth])

  const openSettings = useCallback(() => {
    closeLeftSidebar()
    setSettingsVisible(true)
  }, [closeLeftSidebar])

  const closeSettings = useCallback(() => {
    setSettingsVisible(false)
  }, [])

  const pathname = usePathname()
  const params = useLocalSearchParams<{ projectId?: string; sessionId?: string }>()

  if (!session) return null

  const filteredProjects = projectSearchQuery
    ? projects.filter((p) =>
        p.name.toLowerCase().includes(projectSearchQuery.toLowerCase())
      )
    : projects

  return (
    <SafeAreaProvider>
      <View className="flex-1">
        <View className="bg-yellow-500 px-3 py-1">
          <Text className="text-black text-xs font-mono">
            path: {pathname} | projectId: {params.projectId ?? '—'} | sessionId: {params.sessionId ?? '—'}
          </Text>
        </View>
        {isTabletLandscape ? (
          // iPad landscape: split-pane layout
          <SplitLayout
            session={session}
            messages={messages}
            changes={changes}
            onMenuPress={openLeftSidebar}
            onProjectsPress={openRightSidebar}
            onToolCallPress={() => {}}
            settings={settings}
          />
        ) : settingsVisible ? (
          // Phone/portrait: full-screen settings
          <SettingsScreen
            serverUrl={settings.serverUrl}
            onServerUrlChange={settings.setServerUrl}
            connection={settings.connection}
            handsFreeAutoRecord={settings.handsFreeAutoRecord}
            onHandsFreeAutoRecordChange={settings.setHandsFreeAutoRecord}
            notificationSound={settings.notificationSound}
            onNotificationSoundChange={settings.setNotificationSound}
            notificationSoundOptions={settings.notificationSoundOptions}
            appVersion={settings.appVersion}
            defaultModel={settings.defaultModel}
            onBack={closeSettings}
          />
        ) : (
          // Phone/portrait: single-column session
          <SessionScreen
            session={session}
            messages={messages}
            changes={changes}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onMenuPress={openLeftSidebar}
            onProjectsPress={openRightSidebar}
            onToolCallPress={() => {}}
          />
        )}

        {/* Left sidebar overlay (sessions) */}
        {leftSidebarVisible && (
          <View className="absolute inset-0" style={{ zIndex: 50 }}>
            <Animated.View
              className="absolute inset-0 bg-black"
              style={{ opacity: leftBackdropAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.5] }) }}
            >
              <Pressable className="flex-1" onPress={closeLeftSidebar} />
            </Animated.View>
            <Animated.View
              className="absolute top-0 bottom-0 left-0"
              style={{ width: sidebarWidth, transform: [{ translateX: leftSlideAnim }] }}
            >
              <SessionsSidebar
                sessions={sidebarSessions}
                selectedSessionId={sessionId}
                searchQuery={sessionSearchQuery}
                onSearchChange={setSessionSearchQuery}
                onClose={closeLeftSidebar}
                onNewSession={() => {}}
                onSelectSession={() => {}}
                onOverflowSession={() => {}}
                onSettingsPress={openSettings}
                onMicPress={() => {}}
                onHelpPress={() => {}}
              />
            </Animated.View>
          </View>
        )}

        {/* Right sidebar overlay (projects) */}
        {rightSidebarVisible && (
          <View className="absolute inset-0" style={{ zIndex: 50 }}>
            <Animated.View
              className="absolute inset-0 bg-black"
              style={{ opacity: rightBackdropAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.5] }) }}
            >
              <Pressable className="flex-1" onPress={closeRightSidebar} />
            </Animated.View>
            <Animated.View
              className="absolute top-0 bottom-0 right-0"
              style={{ width: sidebarWidth, transform: [{ translateX: rightSlideAnim }] }}
            >
              <ProjectsSidebar
                projects={filteredProjects}
                selectedProjectId="proj-1"
                searchQuery={projectSearchQuery}
                onSearchChange={setProjectSearchQuery}
                onClose={closeRightSidebar}
                onAddProject={() => {}}
                onSelectProject={() => {}}
                onNewSession={() => {}}
                onOverflow={() => {}}
                musicPlayer={musicPlayer}
              />
            </Animated.View>
          </View>
        )}
      </View>
      <StatusBar style="light" />
    </SafeAreaProvider>
  )
}
