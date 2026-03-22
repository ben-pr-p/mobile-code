require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'HandsFreeMedia'
  s.version        = package['version']
  s.summary        = 'Expo module for hands-free headphone button recording'
  s.description    = 'Intercepts headphone play/pause via MPRemoteCommandCenter for hands-free voice recording'
  s.author         = 'flockcode'
  s.homepage       = 'https://github.com/ben-pr-p/flockcode'
  s.license        = { type: 'MIT' }
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: 'https://github.com/ben-pr-p/flockcode.git', tag: s.version.to_s }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.frameworks = 'CallKit', 'AVFoundation', 'MediaPlayer'

  s.source_files = '**/*.swift'
end
