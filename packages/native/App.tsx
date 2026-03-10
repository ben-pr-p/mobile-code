import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { View, Pressable, Animated, PanResponder, Alert, Dimensions } from 'react-native';
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
import { useSettings } from './hooks/useSettings';
import { useLayout } from './hooks/useLayout';
import { useStateQuery, type ProjectValue } from './lib/stream-db';
import { apiClientAtom } from './lib/api';
import { newSessionProjectIdAtom, pinnedSessionIdsAtom } from './state/ui';

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
  const [pinnedSessionIds, setPinnedSessionIds] = useAtom(pinnedSessionIdsAtom);

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
        const { dx, dy, x0 } = gestureState;
        // Only recognize sidebar swipes that start near the screen edges.
        // This prevents horizontal scrolling in code blocks and diffs from
        // being hijacked by the sidebar gesture. (GitHub issue #12)
        const windowWidth = Dimensions.get('window').width;
        const nearLeftEdge = x0 < EDGE_ZONE_WIDTH;
        const nearRightEdge = x0 > windowWidth - EDGE_ZONE_WIDTH;
        if (!nearLeftEdge && !nearRightEdge) return false;
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

  const resolvedPinnedIds = pinnedSessionIds instanceof Promise ? [] : pinnedSessionIds;

  const handleDeleteSession = useCallback(
    async (sid: string) => {
      try {
        const res = await api.api.sessions[':sessionId'].$delete({
          param: { sessionId: sid },
        });
        if (!res.ok) {
          Alert.alert('Error', 'Failed to delete session.');
          return;
        }
        // If we just deleted the active session, navigate away
        if (sid === sessionId && projectId) {
          router.push({ pathname: '/projects/[projectId]', params: { projectId } });
          setNewSessionProjectId(projectId);
        }
      } catch {
        Alert.alert('Error', 'Failed to delete session.');
      }
    },
    [api, sessionId, projectId, router, setNewSessionProjectId],
  );

  const handleOverflowSession = useCallback(
    (sid: string) => {
      const isPinned = resolvedPinnedIds.includes(sid);
      Alert.alert(
        'Session Options',
        undefined,
        [
          {
            text: isPinned ? 'Unpin Session' : 'Pin Session',
            onPress: () => {
              if (isPinned) {
                setPinnedSessionIds(resolvedPinnedIds.filter((id: string) => id !== sid));
              } else {
                setPinnedSessionIds([...resolvedPinnedIds, sid]);
              }
            },
          },
          {
            text: 'Delete Session',
            style: 'destructive',
            onPress: () => {
              Alert.alert(
                'Delete Session',
                'This will permanently delete the session and all its data. This cannot be undone.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () => handleDeleteSession(sid),
                  },
                ],
              );
            },
          },
          { text: 'Cancel', style: 'cancel' },
        ],
      );
    },
    [resolvedPinnedIds, setPinnedSessionIds, handleDeleteSession],
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
      // Navigate first, then clear the atom. If we clear the atom first,
      // the component tree re-renders with no sessionId and no newSessionProjectId,
      // briefly showing EmptySession and potentially losing the navigation.
      // The useEffect cleanup at line 241 will clear newSessionProjectId once
      // the router has set the sessionId param.
      router.push({
        pathname: '/projects/[projectId]/sessions/[sessionId]',
        params: { projectId: pid, sessionId: newSessionId },
      });
    },
    [router]
  );

  // Clear new-session placeholder when navigating to an actual session
  useEffect(() => {
    if (sessionId && newSessionProjectId) {
      setNewSessionProjectId(null);
    }
  }, [sessionId, newSessionProjectId, setNewSessionProjectId]);

  // Alert the user if expo-updates rolled back due to a crash in a previous OTA update
  useEffect(() => {
    if (settings.isEmergencyLaunch) {
      Alert.alert(
        'Update Rolled Back',
        'The last OTA update crashed on launch and was automatically rolled back. ' +
        'The app is running the previous working version. ' +
        'Check the published update for errors before re-publishing.',
      );
    }
  }, [settings.isEmergencyLaunch]);

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
                onOverflowSession={handleOverflowSession}
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
const EDGE_ZONE_WIDTH = 40; // px from screen edge where swipe gestures are recognized
const SWIPE_THRESHOLD = 20; // Minimum px to recognize as a horizontal swipe
const SWIPE_MIN_DISTANCE = 50; // Minimum px distance to trigger sidebar open
const SWIPE_VELOCITY_THRESHOLD = 0.5; // Minimum velocity to trigger sidebar open
