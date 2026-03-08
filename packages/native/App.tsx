import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { View, Pressable, Animated, PanResponder } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAtomValue, useAtom } from 'jotai';

import './global.css';
import { SessionContent, NewSessionContent } from './components/SessionContent';
import { SessionsSidebar } from './components/SessionsSidebar';
import { ProjectsSidebar } from './components/ProjectsSidebar';
import { SettingsScreen } from './components/SettingsScreen';
import { EmptySession } from './components/EmptySession';
import { useMusicPlayer } from './hooks/useMusicPlayer';
import { useSettings } from './hooks/useSettings';
import { useLayout } from './hooks/useLayout';
import { useStateQuery, type ProjectValue } from './lib/stream-db';
import { apiClientAtom } from './lib/api';
import { newSessionProjectIdAtom } from './state/ui';

export default function App() {
  const { isTabletLandscape, width: screenWidth } = useLayout();
  const sidebarWidth = screenWidth * 0.85;
  const router = useRouter();
  const params = useLocalSearchParams<{ projectId?: string; sessionId?: string }>();

  const sessionId = params.sessionId;
  const projectId = params.projectId;
  const { data: rawProjects } = useStateQuery(
    (db, q) => q.from({ projects: db.collections.projects }),
  );
  const projects = useMemo(() =>
    (rawProjects as ProjectValue[] | undefined)
      ?.slice()
      .sort((a, b) => b.time.created - a.time.created) ?? [],
    [rawProjects],
  );
  const api = useAtomValue(apiClientAtom);
  const [newSessionProjectId, setNewSessionProjectId] = useAtom(newSessionProjectIdAtom);

  // Settings (only used for phone layout; iPad handles settings in left panel)
  const [settingsVisible, setSettingsVisible] = useState(false);
  const settings = useSettings();

  // Left sidebar (sessions)
  const [leftSidebarVisible, setLeftSidebarVisible] = useState(false);
  const leftSlideAnim = useRef(new Animated.Value(-sidebarWidth)).current;
  const leftBackdropAnim = useRef(new Animated.Value(0)).current;

  // Right sidebar (projects)
  const [rightSidebarVisible, setRightSidebarVisible] = useState(false);
  const rightSlideAnim = useRef(new Animated.Value(sidebarWidth)).current;
  const rightBackdropAnim = useRef(new Animated.Value(0)).current;
  const musicPlayer = useMusicPlayer();

  const openLeftSidebarRef = useRef<() => void>();
  const openRightSidebarRef = useRef<() => void>();
  const closeLeftSidebarRef = useRef<() => void>();
  const closeRightSidebarRef = useRef<() => void>();
  const leftSidebarVisibleRef = useRef(false);
  const rightSidebarVisibleRef = useRef(false);

  // Swipe gesture handling for opening/closing sidebars
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_evt, gestureState) => {
        const { dx, dy } = gestureState;
        return Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > SWIPE_THRESHOLD;
      },
      onPanResponderRelease: (_evt, gestureState) => {
        const { dx, vx } = gestureState;
        const swipedRight = dx > SWIPE_MIN_DISTANCE || vx > SWIPE_VELOCITY_THRESHOLD;
        const swipedLeft = dx < -SWIPE_MIN_DISTANCE || vx < -SWIPE_VELOCITY_THRESHOLD;
        if (swipedRight) {
          if (rightSidebarVisibleRef.current) {
            closeRightSidebarRef.current?.();
          } else {
            openLeftSidebarRef.current?.();
          }
        }
        if (swipedLeft) {
          if (leftSidebarVisibleRef.current) {
            closeLeftSidebarRef.current?.();
          } else {
            openRightSidebarRef.current?.();
          }
        }
      },
    })
  ).current;

  const openLeftSidebar = useCallback(() => {
    setLeftSidebarVisible(true);
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
    ]).start();
  }, [leftSlideAnim, leftBackdropAnim]);

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
      setLeftSidebarVisible(false);
    });
  }, [leftSlideAnim, leftBackdropAnim, sidebarWidth]);

  const openRightSidebar = useCallback(() => {
    setRightSidebarVisible(true);
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
    ]).start();
  }, [rightSlideAnim, rightBackdropAnim]);

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
      setRightSidebarVisible(false);
    });
  }, [rightSlideAnim, rightBackdropAnim, sidebarWidth]);

  openLeftSidebarRef.current = openLeftSidebar;
  openRightSidebarRef.current = openRightSidebar;
  closeLeftSidebarRef.current = closeLeftSidebar;
  closeRightSidebarRef.current = closeRightSidebar;
  leftSidebarVisibleRef.current = leftSidebarVisible;
  rightSidebarVisibleRef.current = rightSidebarVisible;

  const openSettings = useCallback(() => {
    closeLeftSidebar();
    setSettingsVisible(true);
  }, [closeLeftSidebar]);

  const closeSettings = useCallback(() => {
    setSettingsVisible(false);
  }, []);

  const navigateToProject = useCallback(
    async (pid: string) => {
      try {
        const res = await api.api.projects[':projectId'].sessions.$get({
          param: { projectId: pid },
        });
        if (res.ok) {
          const sessions = await res.json() as any[];
          if (sessions.length > 0) {
            router.push({
              pathname: '/projects/[projectId]/sessions/[sessionId]',
              params: { projectId: pid, sessionId: sessions[0].id },
            });
            return;
          }
        }
      } catch {}
      setNewSessionProjectId(pid);
      router.push({ pathname: '/projects/[projectId]', params: { projectId: pid } });
    },
    [api, router, setNewSessionProjectId]
  );

  const handleSelectProject = useCallback(
    (pid: string) => {
      navigateToProject(pid);
      closeRightSidebar();
    },
    [navigateToProject, closeRightSidebar]
  );

  const handleSelectSession = useCallback(
    (sid: string, pid: string) => {
      setNewSessionProjectId(null);
      router.push({
        pathname: '/projects/[projectId]/sessions/[sessionId]',
        params: { projectId: pid, sessionId: sid },
      });
      closeLeftSidebar();
    },
    [router, closeLeftSidebar, setNewSessionProjectId]
  );

  const handleNewSession = useCallback(() => {
    if (!projectId) return;
    // If already in new-session mode for this project, just close the sidebar
    if (newSessionProjectId === projectId && !sessionId) {
      closeLeftSidebar();
      return;
    }
    setNewSessionProjectId(projectId);
    // Navigate to the project route (no sessionId) so the new session view shows
    router.push({ pathname: '/projects/[projectId]', params: { projectId } });
    closeLeftSidebar();
  }, [projectId, newSessionProjectId, sessionId, setNewSessionProjectId, router, closeLeftSidebar]);

  const handleNewSessionCreated = useCallback(
    (newSessionId: string, pid: string) => {
      setNewSessionProjectId(null);
      router.push({
        pathname: '/projects/[projectId]/sessions/[sessionId]',
        params: { projectId: pid, sessionId: newSessionId },
      });
    },
    [router, setNewSessionProjectId]
  );

  // Clear new-session placeholder when navigating to an actual session
  useEffect(() => {
    if (sessionId && newSessionProjectId) {
      setNewSessionProjectId(null);
    }
  }, [sessionId, newSessionProjectId, setNewSessionProjectId]);

  // Auto-navigate to the most recent project on initial load
  const hasAutoNavigated = useRef(false);
  useEffect(() => {
    if (hasAutoNavigated.current || sessionId || projectId) return;
    if (projects.length === 0) return;
    hasAutoNavigated.current = true;
    navigateToProject(projects[0].id);
  }, [projects, sessionId, projectId, navigateToProject]);

  return (
    <SafeAreaProvider>
      <View className="flex-1" {...panResponder.panHandlers}>
        {settingsVisible ? (
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
        ) : sessionId ? (
          <SessionContent
            sessionId={sessionId}
            isTabletLandscape={isTabletLandscape}
            onMenuPress={openLeftSidebar}
            onProjectsPress={openRightSidebar}
            settings={settings}
          />
        ) : newSessionProjectId ? (
          <NewSessionContent
            projectId={newSessionProjectId}
            isTabletLandscape={isTabletLandscape}
            onMenuPress={openLeftSidebar}
            onProjectsPress={openRightSidebar}
            onSessionCreated={handleNewSessionCreated}
            settings={settings}
          />
        ) : (
          <EmptySession onMenuPress={openLeftSidebar} onProjectsPress={openRightSidebar} />
        )}

        {/* Left sidebar overlay (sessions) */}
        {leftSidebarVisible && (
          <View className="absolute inset-0" style={{ zIndex: 50 }}>
            <Animated.View
              className="absolute inset-0 bg-black"
              style={{
                opacity: leftBackdropAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 0.5],
                }),
              }}>
              <Pressable className="flex-1" onPress={closeLeftSidebar} />
            </Animated.View>
            <Animated.View
              className="absolute bottom-0 left-0 top-0"
              style={{ width: sidebarWidth, transform: [{ translateX: leftSlideAnim }] }}>
              <SessionsSidebar
                projectId={projectId}
                selectedSessionId={params.sessionId ?? null}
                onClose={closeLeftSidebar}
                onNewSession={handleNewSession}
                onSelectSession={handleSelectSession}
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
              style={{
                opacity: rightBackdropAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 0.5],
                }),
              }}>
              <Pressable className="flex-1" onPress={closeRightSidebar} />
            </Animated.View>
            <Animated.View
              className="absolute bottom-0 right-0 top-0"
              style={{ width: sidebarWidth, transform: [{ translateX: rightSlideAnim }] }}>
              <ProjectsSidebar
                selectedProjectId={projectId ?? null}
                onClose={closeRightSidebar}
                onAddProject={() => {}}
                onSelectProject={handleSelectProject}
                onNewSession={handleNewSession}
                onOverflow={() => {}}
                musicPlayer={musicPlayer}
              />
            </Animated.View>
          </View>
        )}
      </View>
      <StatusBar style="auto" />
    </SafeAreaProvider>
  );
}

const ANIMATION_DURATION = 280;
const SWIPE_THRESHOLD = 10; // Minimum px to recognize as a horizontal swipe
const SWIPE_MIN_DISTANCE = 50; // Minimum px distance to trigger sidebar open
const SWIPE_VELOCITY_THRESHOLD = 0.5; // Minimum velocity to trigger sidebar open
